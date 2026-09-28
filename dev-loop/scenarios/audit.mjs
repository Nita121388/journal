import { join } from 'node:path';

/**
 * Audit capture scenario: cycles widths × theme (light/dark) × view modes
 * (timeline/week/month) and captures screenshots + key layout measurements
 * for the UX audit. Designed to run against the isolated (seeded) host.
 *
 * Usage:
 *   node dev-loop.mjs --scenario audit --width 360,400,500 --theme light,dark --modes timeline,week,month
 */

export async function runAudit({ page, width, context }) {
  const { theme = 'light', mode = 'timeline' } = context || {};

  // Set theme via chrome.storage (store.js reads settings.theme)
  await page.evaluate(async (th) => {
    await new Promise((resolve) => {
      chrome.storage.local.get({ settings: null }, (r) => {
        const s = { ...(r.settings || {}), theme: th };
        chrome.storage.local.set({ settings: s }, resolve);
      });
    });
  }, theme);
  await page.waitForTimeout(150);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Set view mode (stored in localStorage by sidepanel.js)
  await page.evaluate((m) => localStorage.setItem('journal.viewMode', m), mode);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Capture both IA states: panels closed (default) and panels open (drawer)
  const shots = [];
  for (const panels of ['closed', 'open']) {
    await page.evaluate((p) => {
      document.body.classList.toggle('panels-open', p === 'open');
    }, panels);
    await page.waitForTimeout(400);
    const name = `${theme}-${mode}-${width}-${panels}`;
    await page.screenshot({ path: join(context.outDir, `${name}.png`), fullPage: true });
    shots.push(name);
  }
  await page.evaluate(() => document.body.classList.remove('panels-open'));

  // Measurements for audit
  const metrics = await page.evaluate(() => {
    const pick = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), visible: r.height > 0 };
    };
    return {
      viewport: { w: innerWidth, h: innerHeight },
      header: pick(document.getElementById('header')),
      sidebar: pick(document.querySelector('#sidebar')),
      timelineSection: pick(document.querySelector('#timeline-section')),
      cardpool: pick(document.querySelector('#cardpool-section')),
      calendar: pick(document.querySelector('#calendar-section')),
      heatmap: pick(document.querySelector('#heatmap-section')),
      firstCard: pick(document.querySelector('#timeline-section .tl-card, #timeline-section .card')),
      banner: pick(document.getElementById('host-banner')),
    };
  });

  const name = `${theme}-${mode}-${width}`;
  return { shots, metrics, theme, mode };
}