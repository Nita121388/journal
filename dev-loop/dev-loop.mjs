#!/usr/bin/env node
/**
 * dev-loop — Agent-driven dev loop for the Journal Chrome extension.
 *
 *   node dev-loop.mjs [--width 360,400,500] [--headed] [--host-mode isolated|off]
 *   node dev-loop.mjs --scenario audit --width 360,400,500 --theme light,dark --modes timeline,week,month
 *
 * Pipeline: isolated host (temp data dir + ephemeral port) → test build of the
 * extension (host port rewritten) → open side panel at each width → scenario checks
 * → screenshots + JSON/Markdown report. Product source and the user's running
 * host (8765/8766) are never touched.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildTestExtension, cleanupDir, detectHostPort, findFreePort, log, makeWorkDir,
  REPO_ROOT, startHost, waitForHealth,
} from './lib/host.mjs';
import { launchBrowser, openSidePanel } from './lib/browser.mjs';
import { writeReport } from './lib/report.mjs';
import { runSmoke } from './scenarios/smoke.mjs';
import { runAudit } from './scenarios/audit.mjs';
import { runTpl } from './scenarios/tpl.mjs';
import { runTailwindMigrated } from './scenarios/tailwind-migrated.mjs';
import { runSelect } from './scenarios/select.mjs';
import { runLlm } from './scenarios/llm.mjs';
import { runOptions } from './scenarios/options.mjs';
import { seedHost } from './lib/seed.mjs';

function parseArgs(argv) {
  const args = {
    widths: [360], headed: false, hostMode: 'isolated', scenario: 'smoke',
    seed: false, themes: ['light'], modes: ['timeline'],
  };
  const setList = (key, v) => (args[key] = v.split(',').filter(Boolean));
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--width') args.widths = argv[++i].split(',').map(Number).filter(Boolean);
    else if (a === '--scenario') args.scenario = argv[++i];
    else if (a === '--theme') setList('themes', argv[++i]);
    else if (a === '--modes') setList('modes', argv[++i]);
    else if (a === '--seed') args.seed = true;
    else if (a === '--headed') args.headed = true;
    else if (a.startsWith('--host-mode=')) args.hostMode = a.split('=')[1];
    else if (a === '--host-mode') args.hostMode = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const startedAt = Date.now();
const productHostPort = detectHostPort();
log('info', `product host port (in source) = ${productHostPort}`);

let workDir, outDir, hostProc = null, hostDataDir = null, hostPort = null, exitCode = 0;
/** @type {Array<object>} 每个宽度的结果。声明在 try 外 —— 失败分支也要用它写报告。 */
let results = [];

try {
  workDir = makeWorkDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  outDir = process.env.DEV_LOOP_OUT || join(REPO_ROOT, 'dev-loop', 'out', ts);
  mkdirSync(outDir, { recursive: true });
  log('info', `work dir = ${workDir}`);
  log('info', `output dir = ${outDir}`);

  let extDir = join(REPO_ROOT, 'extension');
  if (args.hostMode === 'isolated') {
    hostPort = await findFreePort();
    extDir = buildTestExtension({ workDir, testPort: hostPort });
    const h = startHost({ port: hostPort });
    hostProc = h.proc; hostDataDir = h.dataDir;
    await waitForHealth(hostPort);
    log('info', `isolated host up on 127.0.0.1:${hostPort} (data: ${hostDataDir})`);
  } else {
    log('info', 'host-mode=off: panel will render offline banner');
  }

  if (args.seed && hostPort) {
    const created = await seedHost(hostPort);
    log('info', `seeded ${created.length} sample card(s) into isolated host`);
  }

  const { ctx, extId } = await launchBrowser({
    extensionDir: extDir, userDataDir: join(workDir, 'profile'), headed: args.headed,
  });

  results = [];
  /**
   * `--host-mode off` 时前端对 host 的启动探测/拉取必然产生网络层报错
   * （ERR_CONNECTION_REFUSED / Failed to fetch）。那是**被测行为本身**（应优雅降级、显示离线横幅），
   * 不是缺陷 —— 该模式下不计入 error 门禁，但仍计入报告以便观察。
   * @param {string} text
   * @returns {boolean}
   */
  // 白名单必须**窄**：只放过「离线必然发生」的那几类，不能整类吞掉 console error
  // （否则又会退回上一轮被批评的「门禁看起来很绿其实什么都没测」）。
  const isExpectedOfflineNoise = (text) =>
    /ERR_CONNECTION_REFUSED|Failed to load resource|Failed to fetch|NetworkError/i.test(text)
    // 业务侧对失败写入的显式日志（离线时保存必然失败，记日志是正确行为）
    || /\[journal\] (write failed|save card failed)/.test(text);
  for (const width of args.widths) {
    if (args.scenario === 'audit') {
      // One page reused across theme×mode combos for this width.
      const page = await (await openSidePanel(ctx, extId, width)).page;
      const combos = [];
      for (const theme of args.themes) {
        for (const mode of args.modes) {
          const { shots, metrics, theme: th, mode: md } = await runAudit({ page, width, context: { theme, mode, outDir } });
          combos.push({ theme: th, mode: md, shots, metrics });
        }
      }
      results.push({ width, checks: [['audit capture', true, `${combos.length} combo(s)`]], errors: [], screenshots: combos.flatMap((c) => c.shots.map((s) => join(outDir, s + '.png'))), settled: true, combos });
      await page.close();
      log('info', `width ${width}: audit captured ${combos.length} theme×mode combos`);
    } else {
      const { page, console_, errors, settled } = await openSidePanel(ctx, extId, width);
      const run = args.scenario === 'tpl' ? runTpl
        : args.scenario === 'tailwind-migrated' ? runTailwindMigrated
        : args.scenario === 'select' ? runSelect
        : args.scenario === 'llm' ? runLlm
        : args.scenario === 'options' ? runOptions
        : runSmoke;
      const { checks } = await run({ page, width, extId });
      const shot = join(outDir, `shot-${width}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      const rawErrors = [
        ...errors,
        ...console_.filter((c) => c.type === 'error').map((c) => `[console.error] ${c.text}`),
      ];
      const collected = args.hostMode === 'off'
        ? rawErrors.filter((t) => !isExpectedOfflineNoise(t))
        : rawErrors;
      results.push({ width, settled, checks, errors: collected, screenshots: [shot], expectedOfflineErrors: rawErrors.length - collected.length });
      log('info', `width ${width}: ${checks.filter((c) => c[1]).length}/${checks.length} checks passed, ${collected.length} error(s)${rawErrors.length > collected.length ? ` (+${rawErrors.length - collected.length} expected offline)`: ''}, settled=${settled}`);
      await page.close();
    }
  }
  await ctx.close();

  const allChecks = results.flatMap((r) => r.checks);
  const passed = allChecks.filter((c) => c[1]).length;
  const total = allChecks.length;
  const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
  const failedChecks = total - passed;
  // 退出码必须同时看「console error」「断言失败」「是否 settled」——
  // 只看 console error 会让全挂的断言也打印 LOOP PASS（假门禁）。
  const unsettled = results.filter((r) => !r.settled).length;
  exitCode = (errorCount > 0 || failedChecks > 0 || unsettled > 0) ? 1 : 0;

  writeReport({
    outDir, startedAt, results, hostMode: args.hostMode,
    summary: { ok: exitCode === 0, passed, total, errorCount, failedChecks, unsettled },
  });
  log('info', exitCode === 0 ? 'LOOP PASS' : `LOOP FAIL（断言失败 ${failedChecks} / error ${errorCount} / 未稳定 ${unsettled}）`);
} catch (e) {
  log('error', String(e.stack || e.message));
  exitCode = 1;
  // 失败也必须留下证据：CI 的 upload-artifact 与「agent 自愈闭环」都依赖它。
  try {
    writeReport({
      outDir, startedAt, results,
      hostMode: args.hostMode,
      summary: { ok: false, error: String(e.stack || e.message), passed: 0, total: 0, errorCount: 1, failedChecks: 0, unsettled: 0 },
    });
    log('info', `失败报告已写入 ${outDir}`);
  } catch (e2) {
    log('error', `写失败报告也失败了：${e2.message}`);
  }
} finally {
  if (hostProc) {
    try { hostProc.kill(); } catch {}
    await new Promise((resolve) => {
      if (hostProc.exitCode !== null || hostProc.signalCode !== null) return resolve();
      const t = setTimeout(() => resolve(), 3000);
      hostProc.once('exit', () => { clearTimeout(t); resolve(); });
    });
  }
  if (hostDataDir) cleanupDir(hostDataDir);
  if (workDir && process.env.DEV_LOOP_KEEP !== '1') cleanupDir(workDir);
}
process.exit(exitCode);
