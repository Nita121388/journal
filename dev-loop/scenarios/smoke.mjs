/**
 * Default smoke scenario — regression for round-1 UX changes.
 * Asserts the P0 layout fix (main workspace above the fold, sidebar as drawer),
 * keyboard reachability, and empty-state actions.
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

  // 4) P0: main workspace (timeline) must be near the top, not buried below panels
  const tlTop = await page.locator('#timeline-section').evaluate((el) => Math.round(el.getBoundingClientRect().top)).catch(() => 9999);
  add('主工作区在首屏（timeline.top < 300）', tlTop < 300, `top=${tlTop}px`);

  // 5) P0: sidebar hidden by default (drawer)
  const sidebarVisible = await page.locator('#sidebar').isVisible().catch(() => false);
  add('侧栏默认收起', !sidebarVisible);

  // 6) P0: drawer opens/closes via header toggle
  await page.locator('#btn-panels').click();
  await page.waitForTimeout(300);
  const drawerOpen = await page.locator('#sidebar').isVisible().catch(() => false);
  add('面板抽屉可打开', drawerOpen);
  if (drawerOpen) {
    // 7) calendar interaction inside the drawer
    try {
      await page.locator('#cal-today').click({ timeout: 4000 });
      await page.waitForTimeout(200);
      add('抽屉内「今天」可用', true);
    } catch (e) {
      add('抽屉内「今天」可用', false, String(e.message).slice(0, 60));
    }
    // 8) #6 keyboard: roving tabindex in calendar
    const roving = await page.locator('#calendar-grid .cal-day').evaluateAll(
      (els) => els.filter((e) => e.tabIndex === 0).length,
    ).catch(() => 0);
    add('日历 roving tabindex（仅 1 个可 Tab）', roving === 1, `${roving} 个 tabIndex=0`);
    const arrowMoved = await page.locator('#calendar-grid').evaluate(async (grid) => {
      const cells = [...grid.querySelectorAll('.cal-day')];
      const active = cells.find((c) => c.tabIndex === 0);
      if (!active) return false;
      active.focus();
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      return document.activeElement !== active;
    }).catch(() => false);
    add('日历方向键可移动焦点', arrowMoved);
  }
  await page.locator('#btn-panels').click();
  await page.waitForTimeout(300);
  const drawerClosed = !(await page.locator('#sidebar').isVisible().catch(() => false));
  add('面板抽屉可关闭', drawerClosed);

  // 9) #6 keyboard: card pool items focusable
  const poolFocusable = await page.locator('#cardpool-list .cardpool-item').evaluateAll(
    (els) => els.length === 0 || els.every((e) => e.tabIndex === 0),
  ).catch(() => false);
  add('卡片池项可键盘聚焦', poolFocusable);

  // 10) #4 empty state offers an action
  const emptyAction = await page.locator('#cardpool-list .empty-action').first().textContent().catch(() => '');
  add('空态有行动按钮', /\S/.test(emptyAction), emptyAction.trim());

  // 11) #5 reduced motion is honored (no error, transition collapsed)
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const dur = await page.locator('#app-title').evaluate(
    (el) => getComputedStyle(el).transitionDuration,
  ).catch(() => '');
  // 解析所有时长值（逗号分隔，支持 1e-05s 等科学计数法）
  const durs = (dur.match(/[\d.e+-]+s/g) || []).map((v) => parseFloat(v)).filter((n) => !Number.isNaN(n));
  const collapsed = durs.length > 0 && durs.every((n) => n < 0.05);
  add('prefers-reduced-motion 生效', collapsed, dur);
  await page.emulateMedia({ reducedMotion: null });

  return { checks };
}
