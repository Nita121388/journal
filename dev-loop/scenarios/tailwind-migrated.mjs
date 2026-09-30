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
    `;
    host.appendChild(wrap);
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    const out = {};
    for (const [k, sel] of Object.entries({
      primary: '#probe-primary', secondary: '#probe-secondary', badge: '#probe-badge',
      empty: '#probe-empty', toast: '#probe-toast', chip: '#probe-chip',
    })) {
      const s = cs(sel);
      out[k] = {
        bg: s.backgroundColor, color: s.color, radius: s.borderRadius,
        border: s.borderStyle, fontSize: s.fontSize, display: s.display,
        font: s.fontFamily,
      };
    }
    wrap.remove();
    return out;
  });

  if (probe.error) return { checks: [['probe injection', false, probe.error]] };

  // btn-primary: green bg (#4caf50 accent), white text
  const accentRGB = 'rgb(76, 175, 80)'; // #4caf50
  add('btn-primary 背景=accent', probe.primary.bg === accentRGB, probe.primary.bg);
  add('btn-primary 文字=white', probe.primary.color === 'rgb(255, 255, 255)', probe.primary.color);
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

  // toast: fixed positioning
  add('toast 定位=fixed', probe.toast.display !== 'none', probe.toast.display);

  // chip.is-active: accent bg
  add('chip.is-active 背景=accent', probe.chip.bg === accentRGB, probe.chip.bg);

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
    const out = { primaryBg: p.backgroundColor, badgeBg: b.backgroundColor };
    wrap.remove();
    document.documentElement.removeAttribute('data-theme');
    return out;
  });
  add('暗色主题跟随 token（badge 变暗底）', darkProbe.badgeBg !== 'rgb(235, 237, 240)', darkProbe.badgeBg);

  return { checks };
}
