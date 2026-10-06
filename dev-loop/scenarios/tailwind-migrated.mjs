/**
 * tailwind-migrated scenario — verifies that components migrated from
 * sidepanel.css into Tailwind @layer components (dist/sidepanel.css) render
 * with the expected computed styles. Guards against:
 *  - load-order / cascade issues (unlayered sidepanel.css vs Tailwind layer)
 *  - broken @theme inline token bridge (circular var refs)
 *  - dark theme not following tokens
 */

export async function runTailwindMigrated({ page, width }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push([name, Boolean(ok), detail || '']);

  // Inject probe elements in the board and measure computed styles.
  const probe = await page.evaluate(() => {
    const host = document.querySelector('#board');
    if (!host) return { error: 'no #board' };
    const wrap = document.createElement('div');
    wrap.id = 'tw-probe';
    wrap.style.display = 'none';
    wrap.innerHTML = `
      <button class="btn-primary" id="probe-primary">保存</button>
      <button class="btn-secondary" id="probe-secondary">取消</button>
      <span class="section-badge" id="probe-badge">3</span>
      <div class="empty-state" id="probe-empty">无数据</div>
      <div class="toast" id="probe-toast">提示</div>
      <span class="chip is-active" id="probe-chip">进行中</span>
      <div class="toast toast-error" id="probe-toast-error">错误</div>
      <div class="toast toast-warn" id="probe-toast-warn">警告</div>
      <div class="toast toast-success" id="probe-toast-success">成功</div>
    `;
    host.appendChild(wrap);
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    const out = {};
    for (const [k, sel] of Object.entries({
      primary: '#probe-primary', secondary: '#probe-secondary', badge: '#probe-badge',
      empty: '#probe-empty', toast: '#probe-toast', chip: '#probe-chip',
      toastError: '#probe-toast-error', toastWarn: '#probe-toast-warn',
      toastSuccess: '#probe-toast-success',
    })) {
      const s = cs(sel);
      out[k] = {
        bg: s.backgroundColor, color: s.color, radius: s.borderRadius,
        border: s.borderStyle, fontSize: s.fontSize, display: s.display,
        font: s.fontFamily, position: s.position, zIndex: s.zIndex,
      };
    }
    wrap.remove();
    return out;
  });

  if (probe.error) return { checks: [['probe injection', false, probe.error]] };

  /**
   * WCAG 相对亮度对比度。
   * @param {string} fg 'rgb(r, g, b)'
   * @param {string} bg 'rgb(r, g, b)'
   * @returns {number}
   */
  const contrast = (fg, bg) => {
    const parse = (s) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s || '');
      return m ? [1, 2, 3].map((i) => Number(m[i]) / 255) : null;
    };
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const a = parse(fg); const b = parse(bg);
    if (!a || !b) return 0;
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // 正文阈值 4.5:1（WCAG AA）。断言语义从「比对 hex」改为「算对比度」——
  // 改色不再是红灯，只有真的降到不可读才失败。
  const AA = 4.5;
  const addContrast = (name, fg, bg) => {
    const r = contrast(fg, bg);
    add(name, r >= AA, `${r.toFixed(2)}:1 (${fg} on ${bg})`);
  };

  add('btn-primary 文字=white', probe.primary.color === 'rgb(255, 255, 255)', probe.primary.color);
  addContrast('btn-primary 对比度 ≥4.5', probe.primary.color, probe.primary.bg);
  add('btn-primary 圆角=6px', probe.primary.radius === '6px', probe.primary.radius);
  add('btn-primary 边框=none', probe.primary.border === 'none', probe.primary.border);

  // btn-secondary: canvas bg + 1px line border
  add('btn-secondary 背景=canvas', probe.secondary.bg === 'rgb(255, 255, 255)', probe.secondary.bg);
  add('btn-secondary 边框=solid', probe.secondary.border === 'solid', probe.secondary.border);

  // section-badge: cell-empty bg + muted text
  add('section-badge 背景=cell-empty', probe.badge.bg === 'rgb(235, 237, 240)', probe.badge.bg); // #ebedf0

  // empty-state: dashed border + muted text
  add('empty-state 边框=dashed', probe.empty.border === 'dashed', probe.empty.border);
  add('empty-state 居中', probe.empty.display === 'block', probe.empty.display);
  add('empty-state 字号=12px', probe.empty.fontSize === '12px', probe.empty.fontSize);

  // toast: fixed positioning, must sit ABOVE popups (z-toast=200) and stay fixed-positioned
  add('toast 定位=fixed', probe.toast.display !== 'none', probe.toast.display);
  add('toast position=fixed', probe.toast.position === 'fixed', probe.toast.position);
  add('toast z-index=200 (高于弹层)', probe.toast.zIndex === '200', probe.toast.zIndex);

  // toast variants resolve via the token bridge (--color-danger/--color-warn/--color-on-accent
  // must be defined in sidepanel.css :root, not hardcoded in dist) — guards the @theme inline
  // self-reference from collapsing to an invalid cycle.
  addContrast('toast-error 对比度 ≥4.5', probe.toastError.color, probe.toastError.bg);
  addContrast('toast-warn 对比度 ≥4.5', probe.toastWarn.color, probe.toastWarn.bg);
  addContrast('toast-success 对比度 ≥4.5', probe.toastSuccess.color, probe.toastSuccess.bg);
  add('toast 前景=--color-on-accent (white)', probe.toastError.color === 'rgb(255, 255, 255)', probe.toastError.color);

  // chip.is-active：背景与文字必须达 AA
  addContrast('chip.is-active 对比度 ≥4.5', probe.chip.color, probe.chip.bg);

  // font-sans bridge: font-family should contain Segoe UI (from --font)
  add('字体桥接 font-sans', /Segoe UI|PingFang|Microsoft YaHei/.test(probe.primary.font), probe.primary.font);

  // ── dark theme follows tokens ──
  const darkProbe = await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const host = document.querySelector('#board');
    const wrap = document.createElement('div');
    wrap.id = 'tw-probe-dark'; wrap.style.display = 'none';
    wrap.innerHTML = '<button class="btn-primary" id="probe-primary-dark">保存</button><span class="section-badge" id="probe-badge-dark">3</span>';
    host.appendChild(wrap);
    const p = getComputedStyle(document.querySelector('#probe-primary-dark'));
    const b = getComputedStyle(document.querySelector('#probe-badge-dark'));
    const out = { primaryBg: p.backgroundColor, primaryColor: p.color, badgeBg: b.backgroundColor, badgeColor: b.color, pageBg: getComputedStyle(document.body).backgroundColor };
    wrap.remove();
    document.documentElement.removeAttribute('data-theme');
    return out;
  });
  add('暗色主题跟随 token（badge 变暗底）', darkProbe.badgeBg !== 'rgb(235, 237, 240)', darkProbe.badgeBg);
  addContrast('暗色 badge 文字对比度 ≥4.5', darkProbe.badgeColor, darkProbe.badgeBg);
  addContrast('暗色 btn-primary 对比度 ≥4.5', darkProbe.primaryColor, darkProbe.primaryBg);

  return { checks };
}
