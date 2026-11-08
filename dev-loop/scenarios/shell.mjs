/**
 * shell scenario — P2 外壳结构回归（header / 视图工具条 / dock 唯一化 / 表面层级）。
 *
 * 守住 prd.md 的 9 条硬门。这些断言全部是「结构不变量」，不依赖任务内容，
 * 所以单独成场景而不是塞进 smoke（smoke 关注首屏可用性）。
 *
 * 亮暗两遍都跑：外壳只允许有 token 差异，不允许出现额外覆盖规则导致结构漂移，
 * 所以同一组结构断言在暗色下必须同样通过。
 */

/**
 * 在给定主题下采集全部外壳度量。
 *
 * 注意：函数体里重新声明 `PICTO` —— `page.evaluate` 的回调在浏览器上下文执行，
 * 拿不到本文件的模块作用域，必须自带依赖。
 * @param {import('playwright').Page} page
 * @param {'light'|'dark'} theme
 */
async function collect(page, theme) {
  await page.evaluate((t) => {
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }, theme);
  // 让 CSS 变量在下一帧生效，避免读到切换前的 computed style
  await page.waitForTimeout(60);

  return page.evaluate(() => {
    const PICTO = /\p{Extended_Pictographic}/u;
    const q = (s) => document.querySelector(s);

    // ① 顶部 emoji 视图按钮组必须彻底消失
    const legacyModes = q('.view-modes');

    // ②③ dock 是唯一视图入口
    const dock = document.getElementById('view-dock');
    const dockModeBtns = dock ? [...dock.querySelectorAll('[data-mode]')] : [];
    const dockActive = dock ? [...dock.querySelectorAll('.is-active')] : [];
    const dockPressed = dockModeBtns.filter((b) => b.getAttribute('aria-pressed') === 'true');

    // ④ 功能 emoji 清零：只看「外壳里的按钮」，卡片内容 emoji 属于内容层不在此列
    const btnSelector = '#header button, .view-header button, .section-header button, .view-dock button';
    const emojiBtns = [...document.querySelectorAll(btnSelector)]
      .filter((b) => PICTO.test(b.textContent || ''))
      .map((b) => ({ id: b.id || '(no id)', text: (b.textContent || '').trim() }));

    // ⑤ header 高度
    const header = document.getElementById('header');
    const headerH = header ? header.getBoundingClientRect().height : -1;

    // ⑥ 无横向滚动
    const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;

    // ⑦ dock 不允许有合成层（design.md §7：backdrop-filter 全站 0 处）
    const dockStyle = dock ? getComputedStyle(dock) : null;
    const dockBackdrop = dockStyle ? (dockStyle.backdropFilter || dockStyle.webkitBackdropFilter || 'none') : '(no dock)';

    // ⑧ header 三个按钮都有可读名称
    const headerBtns = [...document.querySelectorAll('#header button')];
    const headerNoLabel = headerBtns
      .filter((b) => !(b.getAttribute('aria-label') || '').trim())
      .map((b) => b.id || '(no id)');

    // ⑨ 区块标题不再 uppercase / letter-spacing（对中文无效，只增噪）
    // 只查外壳的四个区块头（卡片池/日历/打卡/Skills）；弹窗里的 .section-label 属于 P5
    const labels = [...document.querySelectorAll('#sidebar .section-label')];
    const labelStyles = labels.map((l) => {
      const cs = getComputedStyle(l);
      return {
        text: (l.textContent || '').trim(),
        transform: cs.textTransform,
        spacing: cs.letterSpacing,
        // 图标必须是注入的真 SVG，而不是残留 emoji 文本
        hasSvg: !!l.querySelector('svg'),
      };
    });

    return {
      legacyModes: !!legacyModes,
      dockExists: !!dock,
      dockModeCount: dockModeBtns.length,
      dockActiveCount: dockActive.length,
      dockPressedCount: dockPressed.length,
      emojiBtns,
      btnCount: document.querySelectorAll(btnSelector).length,
      headerH: Math.round(headerH),
      overflowX,
      dockBackdrop,
      headerBtnCount: headerBtns.length,
      headerNoLabel,
      labelStyles,
      // dock 是否遮挡最后一条内容：dock 是 flow 内 sticky 元素，不应与容器发生重叠
      dockOverlap: (() => {
        if (!dock) return -1;
        const sec = document.getElementById('timeline-section');
        const cont = document.getElementById('timeline-container');
        if (!sec || !cont) return -1;
        const d = dock.getBoundingClientRect();
        const c = cont.getBoundingClientRect();
        return Math.round(c.bottom - d.top); // >0 表示内容被 dock 压住
      })(),
    };
  });
}

export async function runShell({ page, width, outDir }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push([name, Boolean(ok), detail || '']);
  const shot = async (tag) => {
    if (!outDir) return;
    await page.screenshot({ path: `${outDir}/shell-${tag}-${width}.png`, fullPage: true }).catch(() => {});
  };

  for (const theme of ['light', 'dark']) {
    const m = await collect(page, theme);
    const tag = `[${theme}]`;

    add(`${tag} .view-modes 已删除`, !m.legacyModes, `found=${m.legacyModes}`);
    add(`${tag} #view-dock 存在且 3 个 [data-mode] 按钮`,
      m.dockExists && m.dockModeCount === 3, `exists=${m.dockExists} count=${m.dockModeCount}`);
    add(`${tag} dock 有且只有一个选中项`,
      m.dockActiveCount === 1 && m.dockPressedCount === 1,
      `is-active=${m.dockActiveCount} aria-pressed=${m.dockPressedCount}`);
    add(`${tag} 外壳按钮无功能 emoji`,
      m.emojiBtns.length === 0,
      m.emojiBtns.length ? JSON.stringify(m.emojiBtns) : `${m.btnCount} 个按钮全洁净`);
    add(`${tag} header 高 44px`, Math.abs(m.headerH - 44) <= 1, `${m.headerH}px`);
    add(`${tag} 无横向滚动`, m.overflowX <= 1, `overflowX=${m.overflowX}px`);
    add(`${tag} dock 无 backdrop-filter`,
      m.dockBackdrop === 'none', `backdropFilter=${m.dockBackdrop}`);
    add(`${tag} header 按钮 ≥3 且都有 aria-label`,
      m.headerBtnCount >= 3 && m.headerNoLabel.length === 0,
      `count=${m.headerBtnCount} missing=[${m.headerNoLabel.join(',')}]`);
    add(`${tag} .section-label 无 uppercase / letter-spacing 且带 SVG 图标`,
      m.labelStyles.length === 4
        && m.labelStyles.every((l) => l.transform === 'none'
          && (l.spacing === 'normal' || l.spacing === '0px')
          && l.hasSvg),
      m.labelStyles.map((l) => `${l.text}:${l.transform}/${l.spacing}/${l.hasSvg ? 'svg' : 'NOsvg'}`).join(' | '));
    add(`${tag} dock 不压住内容区底部`, m.dockOverlap <= 0, `overlap=${m.dockOverlap}px`);

    await shot(theme);
  }

  // 回到亮色，避免影响后续同页断言（audit 场景会复用 page）。
  // 等一次 transition 落定：theme 翻转会重启 background-color 过渡，
  // 否则 dev-loop 末尾的全页截图会拍到「过渡中间色」，看起来像样张颜色不对。
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await page.waitForTimeout(250);

  // ⎨10⎩ 键盘可达 + 焦点环（prd 验收项）：header 三按钮与 dock 三按钮可 Tab 到，
  // 且 :focus-visible 出来的是 2px accent 实线（不得被 outline:none 浸掉）。
  const targets = ['btn-panels', 'btn-host-status', 'btn-settings', 'view-prev', 'btn-quick-add', 'btn-wide-mode'];
  const dockTargets = await page.evaluate(() =>
    [...document.querySelectorAll('#view-dock [data-mode]')].map((b) => b.dataset.mode));
  const seen = new Map(); // id -> focus-visible 环信息
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        id: el.id || '',
        dockMode: el.closest('#view-dock') ? (el.dataset.mode || '') : '',
        outlineWidth: cs.outlineWidth,
        outlineStyle: cs.outlineStyle,
        outlineColor: cs.outlineColor,
      };
    });
    if (!info) continue;
    const key = info.id || (info.dockMode ? `dock:${info.dockMode}` : '');
    if (key && (targets.includes(info.id) || info.dockMode)) {
      seen.set(key, { w: info.outlineWidth, s: info.outlineStyle, c: info.outlineColor });
    }
    if (seen.size >= targets.length + dockTargets.length) break;
  }
  const seenKeys = [...seen.keys()];
  const expected = [...targets, ...dockTargets.map((m) => `dock:${m}`)];
  add('header + dock 按钮全部 Tab 可达', expected.every((k) => seen.has(k)),
    `已到: ${seenKeys.join(',')} / 应有: ${expected.join(',')}`);
  const ringOk = [...seen.values()].every((r) => r.w === '2px' && r.s === 'solid');
  add('键盘焦点环 2px 实线（:focus-visible）', ringOk && seen.size > 0,
    [...seen.entries()].map(([k, r]) => `${k}:${r.w}/${r.s}/${r.c}`).join(' | '));

  return { checks };
}
