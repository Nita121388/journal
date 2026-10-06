/**
 * Default smoke scenario — regression for round-1 UX changes.
 * Asserts the P0 layout fix (main workspace above the fold, sidebar as drawer),
 * keyboard reachability, and empty-state actions.
 */

import { AA_NORMAL, contrastRatio } from '../lib/a11y.mjs';

export async function runSmoke({ page }) {
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

  // 9) #6 keyboard: 卡片池项可聚焦
  // 不能写成 `els.length === 0 || every(...)` —— 空列表时恒真，是假断言；
  // 也不能只写 `length > 0 && every(...)` —— 空池时必然失败。
  // 正确做法：**两个分支各自断言真实不变量**。
  const poolState = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#cardpool-list .cardpool-item')];
    return {
      count: items.length,
      tabs: items.map((e) => e.tabIndex),
      hasEmpty: !!document.querySelector('#cardpool-list .todo-empty'),
    };
  });
  add('卡片池：空则显示空态，非空则每项可键盘聚焦',
    poolState.count === 0 ? poolState.hasEmpty : poolState.tabs.every((t) => t === 0),
    `items=${poolState.count} tabs=[${poolState.tabs.join(',')}] empty=${poolState.hasEmpty}`);

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

  // 12) 打开时的滚动定位：有卡 → 当前时刻居中；空日 → 回到顶部（以免空态引导被滚出视口）
  const nowC = await page.evaluate(() => {
    const c = document.getElementById('timeline-container');
    const m = document.querySelector('.timeline-now-marker');
    if (!c || !m) return null;
    const cr = c.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    const delta = mr.top - cr.top - cr.height / 2;
    return { delta: Math.round(delta), h: Math.round(cr.height), ok: Math.abs(delta) <= cr.height * 0.2 };
  }).catch(() => null);
  const isEmptyDay = await page.evaluate(
    () => document.querySelectorAll('#timeline-container .timeline-card').length === 0,
  ).catch(() => false);
  if (isEmptyDay) {
    const atTop = await page.evaluate(() => document.getElementById('timeline-container').scrollTop <= 1).catch(() => null);
    add('空日打开时回到顶部（引导可见）', atTop === true, `scrollTop=${atTop}`);
  } else {
    add('打开时当前时刻垂直居中', nowC?.ok === true, nowC ? `Δ=${nowC.delta}px / ${nowC.h}px` : '不可测');
  }

  // 12b) 空日：首屏引导必须在视口内（曾经被 focusScroll 滚出屏幕）
  const hintVis = await page.evaluate(() => {
    const c = document.getElementById('timeline-container');
    const h = c && c.querySelector('.timeline-empty-hint');
    if (!c || !h) return null;
    const cr = c.getBoundingClientRect();
    const hr = h.getBoundingClientRect();
    return {
      visible: hr.top >= cr.top - 1 && hr.bottom <= cr.bottom + 1,
      top: Math.round(hr.top - cr.top),
      h: Math.round(cr.height),
    };
  });
  add('空日引导在视口内可见', hintVis?.visible === true, hintVis ? `Δtop=${hintVis.top}px / ${hintVis.h}px` : '无空态提示');

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
  await page.waitForTimeout(300);
  // 优先级刚被改过 → 脏状态 → closeEditor 前会先确认（新增行为）
  if (await page.locator('#app-dialog').isVisible().catch(() => false)) {
    await page.locator('#app-dialog-actions .btn-primary').click();
    await page.waitForTimeout(300);
  }
  add('编辑器可取消关闭（脏状态经确认）', !(await page.locator('#card-editor-overlay').isVisible().catch(() => true)));

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

  // 15) 卡片池搜索（本地过滤，零请求）
  await page.locator('#btn-panels').click();
  await page.waitForTimeout(300);
  add('卡片池有搜索框', await page.locator('#pool-search').isVisible().catch(() => false));
  await page.locator('#pool-search').fill('zzz-no-match-zzz');
  await page.waitForTimeout(250);
  const emptyText = (await page.locator('#cardpool-list .empty-title').first().textContent().catch(() => '')) || '';
  add('搜索无结果给出明确空态', /没有匹配/.test(emptyText), emptyText.trim());
  await page.locator('#pool-search').fill('');
  await page.waitForTimeout(250);
  await page.locator('#btn-panels').click();
  await page.waitForTimeout(250);

  // 16) 深色模式：主题生效 + 关键文字对比度达 AA（此前深色从未被审计）
  const darkProbe = await page.evaluate(() => {
    const prev = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    const cs = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el) : null;
    };
    const body = cs('body');
    const today = cs('#today-display');
    const out = {
      bodyBg: body?.backgroundColor ?? '',
      todayColor: today?.color ?? '',
      todayBg: body?.backgroundColor ?? '',
    };
    if (prev) document.documentElement.setAttribute('data-theme', prev);
    else document.documentElement.removeAttribute('data-theme');
    return out;
  });
  add('深色模式生效（页面底色变暗）', /rgb\((\d+),\s*\1,\s*\1\)/.test(darkProbe.bodyBg), darkProbe.bodyBg);
  const darkRatio = contrastRatio(darkProbe.todayColor, darkProbe.todayBg);
  add('深色模式次要文字对比度 ≥4.5', darkRatio >= AA_NORMAL, `${darkRatio.toFixed(2)}:1 (${darkProbe.todayColor} on ${darkProbe.todayBg})`);

  // 16) 时间线拖动框选建卡（range-select 与周视图共用；此前两份实现已分叉）
  const tlBox = await page.locator('#timeline-container').boundingBox();
  let rangeOk = false;
  let rangeDetail = '无法定位时间线容器';
  if (tlBox) {
    const cx = tlBox.x + tlBox.width / 2;
    const cy0 = tlBox.y + 120;
    await page.mouse.move(cx, cy0);
    await page.mouse.down();
    await page.mouse.move(cx, cy0 + 90, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    const opened = await page.locator('#card-editor-overlay').isVisible().catch(() => false);
    if (opened) {
      const st = await page.locator('#card-editor-start').inputValue().catch(() => '');
      const en = await page.locator('#card-editor-end').inputValue().catch(() => '');
      rangeOk = /^\d{2}:\d{2}$/.test(st) && /^\d{2}:\d{2}$/.test(en);
      rangeDetail = `预填 ${st}–${en}`;
      await page.locator('#card-editor-cancel').click();
      await page.waitForTimeout(200);
    } else {
      rangeDetail = '框选后未打开编辑器';
    }
  }
  add('时间线拖动框选可建卡（range-select）', rangeOk, rangeDetail);

  // 17) 建卡主路径。**按 host 是否在线分两支** —— 离线时保存必然失败，
  //     此时正确的产品行为是「明确报错 + 保留草稿」，而不是把卡存下去。
  //     （第一轮曾漏掉这一支，导致 --host-mode off 门禁实际是崩的。）
  const hostOnline = await page.evaluate(
    () => document.getElementById('btn-host-status')?.classList.contains('is-online') === true,
  ).catch(() => false);

  if (hostOnline) {
    await page.locator('#btn-quick-add').click();
    await page.waitForTimeout(400);
    await page.locator('#card-editor-title').fill('只填标题的卡');
    await page.locator('#card-editor-save').click();
    await page.waitForTimeout(900);
    const titleOnly = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#timeline-container .timeline-card')];
      const hit = cards.find((c) => (c.textContent || '').includes('只填标题的卡'));
      return {
        total: cards.length,
        found: Boolean(hit),
        notEmptyPlaceholder: !/空卡片/.test(hit ? hit.textContent || '' : ''),
        tabIndex: hit ? hit.tabIndex : -1,
        role: hit ? hit.getAttribute('role') || '' : '',
        aria: hit ? hit.getAttribute('aria-label') || '' : '',
      };
    });
    add('只填标题也能建卡（P0 回归）', titleOnly.found, `时间线卡片数=${titleOnly.total}`);
    add('只填标题的卡不显示「空卡片」', titleOnly.found && titleOnly.notEmptyPlaceholder);
    add('时间线卡片键盘可达（tabIndex=0 + role=button）',
      titleOnly.tabIndex === 0 && titleOnly.role === 'button', `tabIndex=${titleOnly.tabIndex} role=${titleOnly.role}`);
    add('时间线卡片有可访问名', /只填标题的卡/.test(titleOnly.aria), titleOnly.aria);

    // 清理：删掉本场景创建的卡片，否则后续宽度会带着它跑，
    // 把「空日引导 / 空态行动按钮 / 当前时刻居中」这些依赖空库的断言弄脏。
    await page.evaluate(() => {
      const hit = [...document.querySelectorAll('#timeline-container .timeline-card')]
        .find((el) => (el.textContent || '').includes('只填标题的卡'));
      hit?.querySelector('button[aria-label="删除卡片"]')?.click();
    });
    await page.waitForTimeout(400);
    if (await page.locator('#app-dialog').isVisible().catch(() => false)) {
      await page.locator('#app-dialog-actions .btn-primary').click();
      await page.waitForTimeout(600);
    }
    const cleaned = await page.evaluate(
      () => document.querySelectorAll('#timeline-container .timeline-card').length === 0,
    ).catch(() => false);
    add('场景自清理（删除本场景创建的卡片）', cleaned);
  } else {
    // 离线分支：保存必须失败、必须有明确提示、且草稿不能丢
    await page.locator('#btn-quick-add').click();
    await page.waitForTimeout(400);
    await page.locator('#card-editor-title').fill('离线草稿');
    await page.locator('#card-editor-save').click();
    await page.waitForTimeout(1200);
    const offlineState = await page.evaluate(() => {
      const toast = document.getElementById('toast');
      const editor = document.getElementById('card-editor-overlay');
      const title = document.getElementById('card-editor-title');
      return {
        toastVisible: !!toast && !toast.classList.contains('hidden'),
        toastText: toast?.textContent || '',
        toastIsError: !!toast && toast.classList.contains('toast-error'),
        editorOpen: !!editor && !editor.classList.contains('hidden'),
        draftKept: title?.value === '离线草稿',
        cards: document.querySelectorAll('#timeline-container .timeline-card').length,
      };
    });
    add('离线保存明确报错（不谎报成功）', offlineState.toastVisible && offlineState.toastIsError, offlineState.toastText.slice(0, 40));
    add('离线保存不落卡', offlineState.cards === 0, `cards=${offlineState.cards}`);
    add('离线保存保留草稿', offlineState.editorOpen && offlineState.draftKept, `open=${offlineState.editorOpen}`);
    // 复位：丢弃草稿，避免污染后续步骤
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const dlgOpen = await page.locator('#app-dialog').isVisible().catch(() => false);
    if (dlgOpen) {
      await page.locator('#app-dialog-actions .btn-primary').click();
      await page.waitForTimeout(400);
    }
    add('离线分支可复位（编辑器已关闭）',
      !(await page.locator('#card-editor-overlay').isVisible().catch(() => true)));
    add('离线横幅可见', await page.locator('#host-banner').isVisible().catch(() => false));
  }

  // 17b) 窄栏编辑器布局修复（评审 P1-3/P1-4）：
  //      「类型」选择器曾被压到 16px；排程区在 320/360 溢出编辑器右边界。
  await page.locator('#btn-quick-add').click();
  await page.waitForTimeout(400);
  const editorLayout = await page.evaluate(() => {
    const box = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) };
    };
    const dialog = document.querySelector('#card-editor-overlay .card-editor');
    const dr = dialog ? dialog.getBoundingClientRect() : null;
    const ids = ['card-editor-type', 'card-editor-start', 'card-editor-end', 'card-editor-duration-min', 'card-editor-duration'];
    const boxes = Object.fromEntries(ids.map((i) => [i, box(i)]));
    const overflow = dr
      ? ids.filter((i) => boxes[i] && boxes[i].l < dr.left - 1 || (boxes[i] && boxes[i].r > dr.right + 1))
      : ['no-dialog'];
    return {
      typeW: boxes['card-editor-type']?.w ?? -1,
      overflow,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  add('「类型」选择器可用宽度（≥90px）', editorLayout.typeW >= 90, `w=${editorLayout.typeW}px`);
  add('编辑器排程区不溢出面板', editorLayout.overflow.length === 0, `溢出=${editorLayout.overflow.join(',') || '无'}`);
  add('编辑器内无横向溢出', editorLayout.overflowX <= 1, `overflowX=${editorLayout.overflowX}px`);
  await page.locator('#card-editor-cancel').click();
  await page.waitForTimeout(300);
  if (await page.locator('#app-dialog').isVisible().catch(() => false)) {
    await page.locator('#app-dialog-actions .btn-primary').click();
    await page.waitForTimeout(300);
  }

  // 17c) 筛选条：6 个状态 chip 必须全部可见（曾藏在被隐藏的横向滚动里）
  await page.locator('#btn-panels').click();
  await page.waitForTimeout(300);
  const chips = await page.evaluate(() => {
    const row = document.getElementById('pool-filter-row');
    if (!row) return null;
    const r = row.getBoundingClientRect();
    const items = [...row.querySelectorAll('.chip')].map((c) => {
      const cr = c.getBoundingClientRect();
      return { text: c.textContent.trim(), fullyVisible: cr.left >= r.left - 1 && cr.right <= r.right + 1 };
    });
    return { count: items.length, hidden: items.filter((i) => !i.fullyVisible).map((i) => i.text) };
  });
  add('状态筛选全部可见（无隐藏 chip）',
    !!chips && chips.count > 0 && chips.hidden.length === 0,
    chips ? `${chips.count} 个，隐藏=[${chips.hidden.join(',')}]` : '无筛选条');
  await page.locator('#btn-panels').click();
  await page.waitForTimeout(300);

  // 18) 关闭语义统一：遮罩点击与 Esc 同义（不再“点击保存”）；脏状态先确认
  await page.locator('#btn-quick-add').click();
  await page.waitForTimeout(400);
  // 必须在浮层**已打开**后再取 bbox（隐藏时 boundingBox() 返回 null）
  const ov = await page.locator('#card-editor-overlay').boundingBox();
  // 干净状态：点遮罩边缘 → 直接关闭
  if (ov) await page.mouse.click(ov.x + 6, ov.y + 6);
  await page.waitForTimeout(350);
  add('遮罩点击=关闭（干净状态）', !(await page.locator('#card-editor-overlay').isVisible().catch(() => true)));

  // 脏状态：填标题后点遮罩 → 先确认，不得静默丢弃
  await page.locator('#btn-quick-add').click();
  await page.waitForTimeout(400);
  await page.locator('#card-editor-title').fill('未保存的改动');
  if (ov) await page.mouse.click(ov.x + 6, ov.y + 6);
  await page.waitForTimeout(400);
  const dirtyDlg = await page.locator('#app-dialog').isVisible().catch(() => false);
  const stillOpen = await page.locator('#card-editor-overlay').isVisible().catch(() => false);
  add('脏状态关闭会先确认（不静默丢弃）', dirtyDlg && stillOpen, `dialog=${dirtyDlg} editor=${stillOpen}`);

  if (dirtyDlg) {
    await page.locator('#app-dialog-actions .btn-secondary').click(); // 取消
    await page.waitForTimeout(350);
    add('确认框取消后编辑器保留', await page.locator('#card-editor-overlay').isVisible().catch(() => false));
    add('取消后确认框已关闭', !(await page.locator('#app-dialog').isVisible().catch(() => true)));

    await page.locator('#card-editor-cancel').click();
    await page.waitForTimeout(400);
    await page.locator('#app-dialog-actions .btn-primary').click(); // 放弃
    await page.waitForTimeout(400);
    add('确认放弃后编辑器关闭', !(await page.locator('#card-editor-overlay').isVisible().catch(() => true)));
  } else {
    add('确认框取消后编辑器保留', false, '确认框未出现');
    add('取消后确认框已关闭', false, '确认框未出现');
    add('确认放弃后编辑器关闭', false, '确认框未出现');
  }

  return { checks };
}
