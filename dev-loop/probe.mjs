/**
 * probe.mjs — 浏览器探针（调试用）
 *
 * 比 dev-loop 更快定位「页面根本没跑起来」类问题：起隔离 host + 真 Chromium，
 * 打开侧栏并直接打印 console / pageerror / 关键元素可见性。
 *
 * 用法：cd dev-loop && node probe.mjs [width]
 *
 * 为什么需要它：dev-loop 的断言失败只会告诉你「某个点击超时」，
 * 而真实原因往往是模块导入错误（如 "does not provide an export named X"）——
 * 那类错误在这里一眼可见。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTestExtension, startHost, waitForHealth, findFreePort } from './lib/host.mjs';
import { launchBrowser, openSidePanel } from './lib/browser.mjs';

const width = Number(process.argv[2]) || 360;

const workDir = mkdtempSync(join(tmpdir(), 'probe-'));
const port = await findFreePort();
const extDir = buildTestExtension({ workDir, testPort: port });
const host = startHost({ port, dataDir: join(workDir, 'data') });
await waitForHealth(port);

const { ctx, extId } = await launchBrowser({
  extensionDir: extDir, userDataDir: join(workDir, 'profile'), headed: false,
});
const { page, console_, errors, settled } = await openSidePanel(ctx, extId, width, { settleTimeout: 6000 });

console.log('--- 启动 ---');
console.log('settled      =', settled);
console.log('page errors  =', errors.length ? errors : '(无)');
console.log('console      =', console_.length ? console_.slice(0, 20) : '(无)');

console.log('--- 探针：打开卡片编辑器 ---');
await page.locator('#btn-quick-add').click().catch((e) => console.log('click failed:', e.message));
await page.waitForTimeout(600);
for (const sel of ['#card-editor-overlay', '#card-editor-cancel', '#card-editor-priority-seg .seg', '#app-dialog']) {
  console.log(`  ${sel} → count=${await page.locator(sel).count()} visible=${await page.locator(sel).first().isVisible().catch(() => false)}`);
}
console.log('--- 之后的 console / errors ---');
console.log('console      =', console_.slice(-10).length ? console_.slice(-10) : '(无)');
console.log('page errors  =', errors.length ? errors : '(无)');

await ctx.close();
try { host.proc.kill(); } catch { /* ignore */ }
