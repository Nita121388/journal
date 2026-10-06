import { chromium } from 'playwright';
import { log } from './host.mjs';

/**
 * Browser lifecycle: launch a persistent Chromium context with the test build loaded,
 * resolve the extension id, and expose helpers to open the side panel at a given width.
 * Uses Playwright's bundled Chromium (channel 'chromium') because Chrome/Edge removed
 * the --load-extension side-load flags.
 */

export async function launchBrowser({ extensionDir, userDataDir, headed = false }) {
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: !headed,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });
  const extId = sw.url().split('/')[2];
  log('info', `browser launched, extension id = ${extId}`);
  return { ctx, extId };
}

/** Open the side panel at a given width and wait until it has settled (data loaded). */
export async function openSidePanel(ctx, extId, width, { height = 800, settleTimeout = 8000 } = {}) {
  const page = await ctx.newPage();
  const console_ = [];
  const errors = [];
  page.on('console', (m) => console_.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.setViewportSize({ width, height });
  await page.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: 'domcontentloaded' });

  // Settle: 等 host 连通性**已判定**（在线或离线）+ 今日日期渲染。
  // 同时校验不变量：离线横幅的可见性必须与状态灯一致（防止两者不同步）。
  let settled = false;
  try {
    await page.waitForFunction(
      () => {
        const btn = document.getElementById('btn-host-status');
        const banner = document.getElementById('host-banner');
        const today = document.getElementById('today-display');
        if (!btn || !today) return false;
        const online = btn.classList.contains('is-online');
        const offline = btn.classList.contains('is-offline');
        if (!online && !offline) return false;              // 状态尚未判定
        const bannerHidden = !banner || banner.classList.contains('hidden');
        if (banner && (offline === bannerHidden)) return false; // 横幅与状态不一致
        return /\d{4}/.test(today.textContent || '');
      },
      { timeout: settleTimeout },
    );
    settled = true;
  } catch {
    log('warn', `panel not fully settled at width ${width} within ${settleTimeout}ms`);
  }
  return { page, console_, errors, settled };
}
