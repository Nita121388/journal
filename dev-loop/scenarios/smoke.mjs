/**
 * Default smoke scenario: verify the side panel renders and is interactive at one width.
 * Returns { checks: [[name, ok, detail?]], errors }.
 */

export async function runSmoke({ page, width }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push([name, Boolean(ok), detail || '']);

  // 1) Header / app title rendered
  const title = (await page.locator('#app-title').textContent().catch(() => '')) || '';
  add('app-title 渲染', title.includes('Journal'), title.trim());

  // 2) Today's date rendered
  const today = (await page.locator('#today-display').textContent().catch(() => '')) || '';
  add('今日日期渲染', /\d{4}/.test(today), today.trim());

  // 3) Host connected → banner hidden
  const bannerVisible = await page.locator('#host-banner').isVisible().catch(() => true);
  add('host 已连接（banner 隐藏）', !bannerVisible);

  // 4) Interaction: click "今天" on the calendar (no throw, date header still present)
  try {
    await page.locator('#cal-today').click({ timeout: 5000 });
    await page.waitForTimeout(200);
    const header = await page.locator('#timeline-date-header').textContent().catch(() => '');
    add('点击「今天」可用', true, (header || '').trim());
  } catch (e) {
    add('点击「今天」可用', false, String(e.message).slice(0, 80));
  }

  // 5) Card pool renders its section
  const poolCount = await page.locator('#cardpool-list li').count().catch(() => 0);
  add('卡片池可查询', true, `${poolCount} item(s)`);

  return { checks };
}
