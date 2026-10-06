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

  // 3) host 状态：状态灯必须已判定，且与离线横幅可见性一致（真实信号，非空断言）
  const hostState = await page.evaluate(() => {
    const btn = document.getElementById('btn-host-status');
    const banner = document.getElementById('host-banner');
    return {
      online: !!btn && btn.classList.contains('is-online'),
      offline: !!btn && btn.classList.contains('is-offline'),
      bannerHidden: !banner || banner.classList.contains('hidden'),
    };
  });
  add('host 状态灯已判定', hostState.online || hostState.offline, JSON.stringify(hostState));
  add('离线横幅与状态灯一致', hostState.offline !== hostState.bannerHidden, JSON.stringify(hostState));

  // 3b) 窄侧栏布局硬约束（320–500px 是侧边栏的常态宽度）
  const layout = await page.evaluate(() => {
    /** 行内元素折行时 boundingRect 会跨多个 line box → 用它算实际行数 */
    const lines = (el) => {
      if (!el) return -1;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize) || 0;
      const lh = cs.lineHeight === 'normal' ? fs * 1.4 : parseFloat(cs.lineHeight);
      return lh ? Math.round(el.getBoundingClientRect().height / lh) : -1;
    };
    const header = document.getElementById('header');
    const dateEl = document.getElementById('timeline-date-header');
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      headerH: header ? Math.round(header.getBoundingClientRect().height) : -1,
      titleLines: lines(document.getElementById('app-title')),
      todayLines: lines(document.getElementById('today-display')),
      dateW: dateEl ? Math.round(dateEl.getBoundingClientRect().width) : -1,
      dateText: dateEl ? (dateEl.textContent || '').trim() : '',
    };
  });
  add('无横向溢出', layout.overflowX <= 1, `overflowX=${layout.overflowX}px`);
  add('标题不折行', layout.titleLines <= 1, `${layout.titleLines} 行`);
  add('日期不折行', layout.todayLines <= 1, `${layout.todayLines} 行（header h=${layout.headerH}px）`);
  add('主视图日期可读（宽 ≥ 60px）', layout.dateW >= 60, `w=${layout.dateW}px "${layout.dateText}"`);

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

  // 13) 卡片编辑器：类型齐全（含「想法」）+ 优先级可设（工作流维度完整）
  await page.locator('#btn-quick-add').click();
  await page.waitForTimeout(350);
  const editorOpen = await page.locator('#card-editor-overlay').isVisible().catch(() => false);
  add('快捷新建打开编辑器', editorOpen);

  const typeOpts = await page.locator('#card-editor-type option')
    .evaluateAll((o) => o.map((x) => x.value)).catch(() => []);
  add('类型含 text/task/idea', ['text', 'task', 'idea'].every((v) => typeOpts.includes(v)), typeOpts.join(','));

  const prioSegs = await page.locator('#card-editor-priority-seg .seg')
    .evaluateAll((els) => els.map((e) => e.dataset.priority)).catch(() => []);
  add('优先级分段含 high/medium/low', ['high', 'medium', 'low'].every((v) => prioSegs.includes(v)), prioSegs.join(','));

  const prioDefault = await page.locator('#card-editor-priority').inputValue().catch(() => '');
  add('优先级默认 medium', prioDefault === 'medium', prioDefault);

  await page.locator('#card-editor-priority-seg .seg[data-priority="high"]').click().catch(() => {});
  await page.waitForTimeout(120);
  const prioAfter = await page.locator('#card-editor-priority').inputValue().catch(() => '');
  add('点击「高」→ 值同步', prioAfter === 'high', prioAfter);

  const prioActive = await page.locator('#card-editor-priority-seg .seg.is-active')
    .getAttribute('data-priority').catch(() => null);
  add('「高」胶囊高亮（单选语义）', prioActive === 'high', String(prioActive));

  await page.locator('#card-editor-cancel').click();
  await page.waitForTimeout(250);
  add('编辑器可取消关闭', !(await page.locator('#card-editor-overlay').isVisible().catch(() => true)));

  // 14) 应用内对话框（替代原生 prompt）：命名视图入口
  await page.locator('#btn-panels').click();
  await page.waitForTimeout(300);
  await page.locator('#btn-save-view').click();
  await page.waitForTimeout(300);
  const dlgVisible = await page.locator('#app-dialog').isVisible().catch(() => false);
  add('命名视图用应用内对话框', dlgVisible);
  add('对话框含输入框', (await page.locator('#app-dialog .app-dialog-input').count()) === 1);
  const dlgFocused = await page.evaluate(() => document.activeElement?.classList?.contains('app-dialog-input') === true);
  add('对话框自动聚焦输入框', dlgFocused);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  add('对话框 Esc 可取消', !(await page.locator('#app-dialog').isVisible().catch(() => true)));
  await page.locator('#btn-panels').click();
  await page.waitForTimeout(250);

  return { checks };
}
