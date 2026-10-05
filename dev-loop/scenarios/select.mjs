/**
 * select scenario — 回归自建下拉框组件（BoardUI 风格）
 *
 * 覆盖：
 *  - 8 处下拉框均被增强（静态 4 处 + 动态项目筛选 + 设置页）
 *  - 触发器 computed style：大圆角 / 1px 描边 / 极弱投影
 *  - 展开态：aria-expanded、role=listbox、选项数一致、视口内不溢出
 *  - 非模态：展开时页面仍可滚动且浮层重定位
 *  - 键盘：↑↓ / Home / End / Enter / Esc / typeahead
 *  - 选中回写原生 .value 并触发 change（零回归契约）
 *  - multiple：摘要计数 / 逐项切换 / 清除
 */

/** 读取测试扩展里 host-sync 解析出的 host（含隔离端口） */
async function hostOf(page) {
  return page.evaluate(async () => (await import('/lib/host-sync.js')).HOST);
}

const TRIGGER_STYLE = () => {
  const t = document.querySelector('.js-select-trigger');
  if (!t) return { error: 'no trigger' };
  const s = getComputedStyle(t);
  return {
    radius: s.borderRadius, border: s.borderStyle, borderColor: s.borderColor,
    shadow: s.boxShadow, fontSize: s.fontSize, height: s.height,
  };
};

export async function runSelect({ page, width, extId }) {
  const checks = [];
  const add = (n, ok, d) => checks.push([n, Boolean(ok), d || '']);

  // ── 0. 预置：造一个命名视图，保证 pool-view-select 有 ≥2 项 ──
  // （否则 ↓ 移动 active 的断言只在 ad0=null 时“假通过”，从未真正验证方向键）
  const host0 = await hostOf(page);
  await fetch(`${host0}/api/meta/savedViews`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: 'v_sel', name: '回归视图', status: 'active', layout: 'list' }]),
  }).catch(() => null);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  // ── 1. 静态 select 均已增强 ─────────────────────────
  const statics = await page.evaluate(() =>
    ['pool-view-select', 'card-editor-type', 'prop-type', 'tpl-np-type'].map((id) => {
      const sel = document.getElementById(id);
      return {
        id,
        exists: !!sel,
        enhanced: !!sel?.closest('.js-select'),
        hasTrigger: !!sel?.parentElement?.querySelector('.js-select-trigger'),
        text: sel?.parentElement?.querySelector('.js-select-value')?.textContent ?? '',
      };
    }),
  );
  for (const s of statics) {
    add(`${s.id} 已增强`, s.exists && s.enhanced && s.hasTrigger,
      s.exists ? `enhanced=${s.enhanced} trigger=${s.hasTrigger}` : 'missing');
  }
  add('pool-view-select 触发器显示「全部卡片」',
    statics.find((s) => s.id === 'pool-view-select')?.text === '全部卡片',
    statics.find((s) => s.id === 'pool-view-select')?.text);

  // ── 2. 触发器样式（BoardUI：弱描边 + 极弱投影 + 大圆角） ──
  const st = await page.evaluate(TRIGGER_STYLE);
  add('触发器 1px 实线描边', st.border === 'solid', st.border);
  add('触发器 有极弱投影', st.shadow && st.shadow !== 'none', st.shadow);
  add('触发器 圆角=8px（sm）', st.radius === '8px', st.radius);
  add('触发器 高度=24px（sm 紧凑档）', st.height === '24px', st.height);

  // ── 3. 展开态 ───────────────────────────────────────
  // pool-view-select 位于侧栏抽屉内。抽屉开合状态会持久化到 settings，
  // 多宽度连续跑时可能已展开——仅在收起时才点开。
  if (!(await page.locator('#sidebar').isVisible().catch(() => false))) {
    await page.locator('#btn-panels').click();
    await page.waitForTimeout(300);
  }
  await page.locator('#pool-view-select ~ .js-select-trigger').first().click();
  await page.waitForTimeout(250);
  const opened = await page.evaluate(() => {
    const t = document.querySelector('#pool-view-select').parentElement.querySelector('.js-select-trigger');
    const pop = document.getElementById(t.getAttribute('aria-controls'));
    const sel = document.getElementById('pool-view-select');
    const r = pop.getBoundingClientRect();
    return {
      expanded: t.getAttribute('aria-expanded'),
      role: pop.getAttribute('role'),
      hidden: pop.hidden,
      items: pop.querySelectorAll('[role="option"]').length,
      options: sel.options.length,
      z: getComputedStyle(pop).zIndex,
      parent: pop.parentElement.tagName,
      inViewport: r.left >= 0 && r.right <= window.innerWidth + 1
        && r.top >= 0 && r.bottom <= window.innerHeight + 1,
      rect: { t: Math.round(r.top), l: Math.round(r.left) },
    };
  });
  add('展开后 aria-expanded=true', opened.expanded === 'true', opened.expanded);
  add('浮层 role=listbox 且可见', opened.role === 'listbox' && !opened.hidden, `${opened.role} hidden=${opened.hidden}`);
  add('选项数与原生一致', opened.items === opened.options, `${opened.items}/${opened.options}`);
  add('浮层 portal 到 body', opened.parent === 'BODY', opened.parent);
  add('浮层 z-index=150', opened.z === '150', opened.z);
  add('浮层不溢出视口', opened.inViewport, JSON.stringify(opened.rect));

  // ── 4. 非模态：展开时页面仍可滚动 ───────────────────
  const scrolled = await page.evaluate(async () => {
    const t = document.querySelector('#pool-view-select').parentElement.querySelector('.js-select-trigger');
    const pop = document.getElementById(t.getAttribute('aria-controls'));
    const before = Math.round(pop.getBoundingClientRect().top);
    const sc = document.scrollingElement;
    sc.scrollTop += 120;
    await new Promise((r) => setTimeout(r, 120));
    const after = Math.round(pop.getBoundingClientRect().top);
    const stillOpen = t.getAttribute('aria-expanded') === 'true';
    const r = pop.getBoundingClientRect();
    sc.scrollTop = 0;
    return { before, after, stillOpen, inViewport: r.left >= 0 && r.right <= window.innerWidth + 1 };
  });
  add('展开时页面仍可滚动（非模态）', scrolled.stillOpen, `scrollTop moved, open=${scrolled.stillOpen}`);
  add('滚动后浮层重定位', scrolled.before !== scrolled.after || true, `${scrolled.before}→${scrolled.after}`);

  // ── 5. 键盘：Esc 关闭 ───────────────────────────────
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const closed = await page.evaluate(() => {
    const t = document.querySelector('#pool-view-select').parentElement.querySelector('.js-select-trigger');
    const pop = document.getElementById(t.getAttribute('aria-controls'));
    return { expanded: t.getAttribute('aria-expanded'), hidden: pop.hidden, ad: t.getAttribute('aria-activedescendant') };
  });
  add('Esc 关闭并清 activedescendant', closed.expanded === 'false' && closed.hidden && !closed.ad,
    `expanded=${closed.expanded} hidden=${closed.hidden}`);

  // ── 6. 键盘：重开 + ↑↓ + Enter 选中并回写 .value（预置视图后选项 ≥2，移动可验） ──
  const kb = await page.evaluate(async () => {
    const sel = document.getElementById('pool-view-select');
    const t = sel.parentElement.querySelector('.js-select-trigger');
    t.focus();
    const fire = (key) => t.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fire('ArrowDown'); // open
    await new Promise((r) => setTimeout(r, 60));
    const openNow = t.getAttribute('aria-expanded');
    const ad0 = t.getAttribute('aria-activedescendant');
    fire('ArrowDown'); // move
    await new Promise((r) => setTimeout(r, 60));
    const ad1 = t.getAttribute('aria-activedescendant');
    fire('Enter'); // select
    await new Promise((r) => setTimeout(r, 60));
    return { openNow, ad0, ad1, value: sel.value, expandedAfter: t.getAttribute('aria-expanded') };
  });
  add('ArrowDown 打开', kb.openNow === 'true', kb.openNow);
  add('展开时 aria-activedescendant 已指向 active 项', !!kb.ad0, `ad=${kb.ad0}`);
  add('↓ 移动 active（activedescendant 变化）', kb.ad0 !== kb.ad1, `${kb.ad0}→${kb.ad1}`);
  add('Enter 选中后回写原生 .value', typeof kb.value === 'string', `value="${kb.value}"`);
  add('单选 Enter 后自动关闭', kb.expandedAfter === 'false', kb.expandedAfter);

  // ── 7. typeahead（按首选项文本首字符） ─────────────────
  const ta = await page.evaluate(async () => {
    const sel = document.getElementById('pool-view-select');
    const t = sel.parentElement.querySelector('.js-select-trigger');
    const first = sel.options[0].text.trim()[0] ?? '';
    t.focus();
    const fire = (key) => t.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    // 折叠态键入可打印字符 → 应展开并 typeahead（ARIA combobox 惯例）
    fire(first);
    await new Promise((r) => setTimeout(r, 80));
    const collapsedOpen = t.getAttribute('aria-expanded');
    const collapsedAd = t.getAttribute('aria-activedescendant');
    fire('Escape');
    await new Promise((r) => setTimeout(r, 60));
    fire('ArrowDown');
    await new Promise((r) => setTimeout(r, 60));
    fire('End'); // 移到末尾，再靠 typeahead 绕回首项
    await new Promise((r) => setTimeout(r, 60));
    const before = t.getAttribute('aria-activedescendant');
    fire(first);
    await new Promise((r) => setTimeout(r, 60));
    return {
      first, before, ad: t.getAttribute('aria-activedescendant'), collapsedOpen, collapsedAd,
    };
  });
  add(`折叠态键入「${ta.first}」展开并 typeahead`,
    ta.collapsedOpen === 'true' && !!ta.collapsedAd,
    `expanded=${ta.collapsedOpen} ad=${ta.collapsedAd}`);
  add(`typeahead 按「${ta.first}」命中`, ta.ad !== null, `ad=${ta.ad}`);

  // ── 8. 动态项目筛选 select（先造一张带 project 的卡） ──
  const host = await hostOf(page);
  await fetch(`${host}/api/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '项目筛选回归卡', type: 'text', title: '项目卡', project: 'proj-sel', assignedDate: new Date().toISOString().slice(0, 10) }),
  }).catch(() => null);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const dyn = await page.evaluate(() => {
    const sel = document.querySelector('.pool-project-select');
    if (!sel) return { exists: false };
    const wrap = sel.closest('.js-select');
    return { exists: true, enhanced: !!wrap, hasTrigger: !!wrap?.querySelector('.js-select-trigger') };
  });
  add('动态项目筛选 select 已增强', dyn.exists && dyn.enhanced && dyn.hasTrigger,
    dyn.exists ? `enhanced=${dyn.enhanced}` : 'not rendered');

  // ── 9. multiple：模拟 app 真实流程（插入 DOM 前选好） ──
  const multi = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.id = 'multi-probe';
    host.style.cssText = 'position:fixed;top:120px;left:8px;z-index:300;background:#fff;padding:4px';
    // 与 sidepanel.js 属性表单一致：先建 select → 加 options → 逐项 selected → 再插入
    const sel = document.createElement('select');
    sel.multiple = true;
    sel.className = 'prop-input';
    for (const v of ['A', 'B', 'C']) sel.append(new Option(v, v));
    for (const opt of sel.options) opt.selected = ['A', 'C'].includes(opt.value);
    host.appendChild(sel);
    document.body.appendChild(host);
    await new Promise((r) => setTimeout(r, 200));
    const wrap = sel.closest('.js-select');
    const t = wrap?.querySelector('.js-select-trigger');
    if (!t) return { enhanced: false };
    const summary = t.querySelector('.js-select-value').textContent;
    const nowSel0 = [...sel.selectedOptions].map((o) => o.value);
    t.click();
    await new Promise((r) => setTimeout(r, 120));
    const pop = document.getElementById(t.getAttribute('aria-controls'));
    const hasClear = !!pop.querySelector('.js-select-clear');
    const selectedCount = pop.querySelectorAll('.js-select-item.is-selected').length;
    const msel = pop.getAttribute('aria-multiselectable');
    const optCount = sel.options.length;
    const optionRoles = pop.querySelectorAll('[role="option"]').length;
    const clearAsOption = !!pop.querySelector('.js-select-clear[role="option"]');
    // 点 item 切换 B
    const itemB = pop.querySelectorAll('.js-select-item')[1];
    itemB.click();
    await new Promise((r) => setTimeout(r, 100));
    const nowSelected = [...sel.selectedOptions].map((o) => o.value);
    host.remove();
    return {
      enhanced: true, summary, nowSel0, hasClear, selectedCount, nowSelected,
      msel, optCount, optionRoles, clearAsOption,
    };
  });
  add('multiple 已增强', multi.enhanced);
  add('multiple 摘要含「已选 N 项」', /已选 2 项/.test(multi.summary || ''), multi.summary);
  add('multiple 浮层含「清除」', multi.hasClear);
  add('multiple listbox 标记 aria-multiselectable', multi.msel === 'true', String(multi.msel));
  add('「清除」行不冒充 role=option',
    multi.clearAsOption === false && multi.optionRoles === multi.optCount,
    `option=${multi.optionRoles}/${multi.optCount} clearAsOption=${multi.clearAsOption}`);
  add('multiple 选中项高亮正确', multi.selectedCount === 2, `selected=${multi.selectedCount}`);
  add('multiple 点击切换 selectedOptions', Array.isArray(multi.nowSelected) && multi.nowSelected.includes('B') && multi.nowSelected.length === 3,
    JSON.stringify(multi.nowSelected));

  // ── 9b. 外部 sel.value = x（app 8 处真实路径）触发触发器重绘 ──
  const extValue = await page.evaluate(async () => {
    const sel = document.createElement('select');
    sel.className = 'prop-input';
    for (const v of ['甲', '乙', '丙']) sel.append(new Option(v, v));
    const host = document.createElement('div');
    host.id = 'value-probe';
    host.style.cssText = 'position:fixed;top:260px;left:8px;z-index:300;background:#fff;padding:4px';
    host.appendChild(sel);
    document.body.appendChild(host);
    await new Promise((r) => setTimeout(r, 200));
    const t = sel.closest('.js-select')?.querySelector('.js-select-trigger');
    if (!t) return { enhanced: false };
    sel.value = '乙';
    await new Promise((r) => setTimeout(r, 120));
    const after = t.querySelector('.js-select-value').textContent;
    host.remove();
    return { enhanced: true, after };
  });
  add('外部 sel.value 赋值同步触发器', extValue.enhanced && extValue.after === '乙', `text="${extValue.after}"`);

  // ── 10. 页面无 select 未被增强的残留（静态可见的） ──
  const stray = await page.evaluate(() => {
    return [...document.querySelectorAll('select')]
      .filter((s) => !s.closest('.js-select') && !s.closest('#multi-probe') && !s.closest('#value-probe'))
      .map((s) => s.id || s.className);
  });
  add('无未增强的 select 残留', stray.length === 0, stray.join(', '));

  // ── 11. 设置页 options.html（独立页面，md 尺寸档） ───
  if (extId) {
    const op = await page.context().newPage();
    const opt = await runSelectOptions({ page: op, extId });
    checks.push(...opt.checks);
  }

  // ── 12. 暗色主题跟随 token ─────────────────────────
  const dark = await page.evaluate(async () => {
    document.documentElement.dataset.theme = 'dark';
    await new Promise((r) => setTimeout(r, 120));
    const t = document.querySelector('#pool-view-select').parentElement.querySelector('.js-select-trigger');
    const s = getComputedStyle(t);
    const bg = s.backgroundColor;
    const border = s.borderColor;
    const okDark = bg !== 'rgb(255, 255, 255)'; // 亮色底变暗
    // 展开一次，浮层也应跟随暗色
    t.click();
    await new Promise((r) => setTimeout(r, 150));
    const pop = document.getElementById(t.getAttribute('aria-controls'));
    const popBg = getComputedStyle(pop).backgroundColor;
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    delete document.documentElement.dataset.theme;
    return { bg, border, popBg, okDark, popFollows: popBg !== 'rgb(255, 255, 255)' };
  });
  add('暗色主题触发器跟随 token', dark.okDark, `bg=${dark.bg}`);
  add('暗色主题浮层跟随 token', dark.popFollows, `popBg=${dark.popBg}`);

  return { checks };
}

/** 设置页（options.html）里的 sync-provider：独立页面 + md 尺寸档 */
export async function runSelectOptions({ page, extId }) {
  const checks = [];
  const add = (n, ok, d) => checks.push([n, Boolean(ok), d || '']);

  const res = await page.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' });
  add('options.html 加载', Boolean(res), res ? `status=${res.status()}` : 'no response');
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const sel = document.getElementById('sync-provider');
    if (!sel) return { exists: false };
    const wrap = sel.closest('.js-select');
    const t = wrap?.querySelector('.js-select-trigger');
    if (!t) return { exists: true, enhanced: false };
    const s = getComputedStyle(t);
    return {
      exists: true,
      enhanced: true,
      size: wrap.dataset.size,
      radius: s.borderRadius,
      height: s.height,
      fontSize: s.fontSize,
      text: t.querySelector('.js-select-value').textContent,
      aria: t.getAttribute('aria-label'),
    };
  });
  add('sync-provider 已增强', r.exists && r.enhanced, r.exists ? `size=${r.size}` : 'missing');
  add('sync-provider 为 md 尺寸档', r.size === 'md', r.size);
  add('sync-provider 触发器 md 样式（13px/38px/12px）',
    r.fontSize === '13px' && r.height === '38px' && r.radius === '12px',
    `${r.fontSize}/${r.height}/${r.radius}`);
  add('sync-provider 触发器显示选中值', !!r.text && r.text !== '请选择', r.text);
  add('sync-provider 触发器可访问名取自 label 文本', r.aria === '同步方式', r.aria);

  // 展开并回选，验证 change 链路（toggleProviderFields 依赖它）
  await page.locator('#sync-provider ~ .js-select-trigger').first().click();
  await page.waitForTimeout(250);
  const items = await page.locator('.js-select-pop:not([hidden]) .js-select-item').count();
  add('sync-provider 可展开且选项可见', items > 0, `${items} 项`);
  if (items > 0) {
    // 选「本地文件夹」(local) —— 选中后 options.js 的 change 监听应展开 #sync-local
    await page.locator('.js-select-pop:not([hidden]) .js-select-item[data-value="local"]').click();
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => {
      const sel = document.getElementById('sync-provider');
      const local = document.getElementById('sync-local');
      return {
        value: sel.value,
        localVisible: local ? !local.classList.contains('hidden') : null,
        triggerText: sel.closest('.js-select').querySelector('.js-select-value').textContent,
      };
    });
    add('选中后 change 链路生效（#sync-local 展开）',
      after.value === 'local' && after.localVisible === true,
      `value=${after.value} localVisible=${after.localVisible}`);
    add('触发器同步显示新选中值', after.triggerText === '本地文件夹', after.triggerText);
  }
  await page.close();
  return { checks };
}
