#!/usr/bin/env node
/**
 * dev-loop — Agent-driven dev loop for the Journal Chrome extension.
 *
 *   node dev-loop.mjs [--width 360,400,500] [--headed] [--host-mode isolated|off]
 *
 * Pipeline: isolated host (temp data dir + ephemeral port) → test build of the
 * extension (host port rewritten) → open side panel at each width → scenario checks
 * → screenshots + JSON/Markdown report. Product source and the user's running
 * host (8765/8766) are never touched.
 */

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  buildTestExtension, cleanupDir, detectHostPort, findFreePort, log, makeWorkDir,
  REPO_ROOT, startHost, waitForHealth,
} from './lib/host.mjs';
import { launchBrowser, openSidePanel } from './lib/browser.mjs';
import { writeReport } from './lib/report.mjs';
import { runSmoke } from './scenarios/smoke.mjs';

function parseArgs(argv) {
  const args = { widths: [360], headed: false, hostMode: 'isolated', scenario: 'smoke' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--width') args.widths = argv[++i].split(',').map(Number).filter(Boolean);
    else if (a === '--headed') args.headed = true;
    else if (a.startsWith('--host-mode=')) args.hostMode = a.split('=')[1];
    else if (a === '--host-mode') args.hostMode = argv[++i];
    else if (a === '--scenario') args.scenario = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const startedAt = Date.now();
const productHostPort = detectHostPort();
log('info', `product host port (in source) = ${productHostPort}`);

let workDir, outDir, hostProc = null, hostDataDir = null, exitCode = 0;

try {
  workDir = makeWorkDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  outDir = process.env.DEV_LOOP_OUT || join(REPO_ROOT, 'dev-loop', 'out', ts);
  mkdirSync(outDir, { recursive: true });
  log('info', `work dir = ${workDir}`);
  log('info', `output dir = ${outDir}`);

  let extDir = join(REPO_ROOT, 'extension');
  if (args.hostMode === 'isolated') {
    const port = await findFreePort();
    extDir = buildTestExtension({ workDir, testPort: port });
    const h = startHost({ port });
    hostProc = h.proc; hostDataDir = h.dataDir;
    await waitForHealth(port);
    log('info', `isolated host up on 127.0.0.1:${port} (data: ${hostDataDir})`);
  } else {
    log('info', 'host-mode=off: panel will render offline banner');
  }

  const { ctx, extId } = await launchBrowser({
    extensionDir: extDir,
    userDataDir: join(workDir, 'profile'),
    headed: args.headed,
  });

  const results = [];
  for (const width of args.widths) {
    const { page, console_, errors, settled } = await openSidePanel(ctx, extId, width);
    const { checks } = await runSmoke({ page, width });
    const shot = join(outDir, `shot-${width}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const errCount = console_.filter((c) => c.type === 'error').length + errors.length;
    results.push({ width, settled, checks, errors: [...errors, ...console_.filter((c) => c.type === 'error').map((c) => `[console.error] ${c.text}`)], screenshot: shot });
    log('info', `width ${width}: ${checks.filter((c) => c[1]).length}/${checks.length} checks passed, ${errCount} error(s), settled=${settled}`);
    await page.close();
  }
  await ctx.close();

  const allChecks = results.flatMap((r) => r.checks);
  const passed = allChecks.filter((c) => c[1]).length;
  const total = allChecks.length;
  const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
  const failedHard = results.some((r) => r.checks.some((c) => !c[1]) && args.hostMode === 'isolated');
  exitCode = (errorCount > 0 || (failedHard && total > 0)) ? 1 : 0;

  writeReport({
    outDir, startedAt, results, hostMode: args.hostMode,
    summary: { ok: exitCode === 0, passed, total, errorCount },
  });
  log('info', exitCode === 0 ? 'LOOP PASS' : 'LOOP FAIL');
} catch (e) {
  log('error', String(e.stack || e.message));
  exitCode = 1;
} finally {
  if (hostProc) {
    try { hostProc.kill(); } catch {}
    // Wait for the host process to fully exit so SQLite files are not locked (Windows).
    await new Promise((resolve) => {
      if (hostProc.exitCode !== null || hostProc.signalCode !== null) return resolve();
      const t = setTimeout(() => resolve(), 3000);
      hostProc.once('exit', () => { clearTimeout(t); resolve(); });
    });
  }
  if (hostDataDir) { cleanupDir(hostDataDir); cleanupDir(hostDataDir); }
  if (workDir && process.env.DEV_LOOP_KEEP !== '1') cleanupDir(workDir);
}
process.exit(exitCode);
