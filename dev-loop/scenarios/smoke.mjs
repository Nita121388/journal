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

  // 11) #5 reduced motion collapses transitions.  //     Target .cal-day (real `transition: border-color .15s`); #app-title has no
  //     transition (default 0s) so asserting on it would pass even without the
  //     reduced-motion CSS — vacuous. Assert both states so the check is real.
  const readDur = (sel) => page.locator(sel).first().evaluate(
    (el) => getComputedStyle(el).transitionDuration,
  ).catch(() => '');
  const maxDur = (s) => (s.match(/[\d.e+-]+s/g) || [])
    .map((v) => parseFloat(v)).filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  const beforeRaw = await readDur('.cal-day');
  const before = maxDur(beforeRaw);
  add('基线：.cal-day 有非零 transition', before >= 0.05, beforeRaw);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const afterRaw = await readDur('.cal-day');
  const after = maxDur(afterRaw);
  add('prefers-reduced-motion 生效（transition 收敛）', after > 0 && after < 0.05, afterRaw);
  await page.emulateMedia({ reducedMotion: null });

  // 12) 打开即聚焦：今天日视图时刻线应在容器垂直中部（±20% 容差）
  const nowC = await page.evaluate(() => {
    const c = document.getElementById('timeline-container');
    const m = document.querySelector('.timeline-now-marker');
    if (!c || !m) return null;
    const cr = c.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    const delta = mr.top - cr.top - cr.height / 2;
    return { delta: Math.round(delta), h: Math.round(cr.height), ok: Math.abs(delta) <= cr.height * 0.2 };
  }).catch(() => null);
  add('打开时当前时刻垂直居中', nowC?.ok === true, nowC ? `Δ=${nowC.delta}px / ${nowC.h}px` : '不可测');

  return { checks };
}
