/**
 * tailwind-migrated scenario — verifies that components migrated from
 * sidepanel.css into Tailwind @layer components (dist/sidepanel.css) render
 * with the expected computed styles. Guards against:
 *  - load-order / cascade issues (unlayered sidepanel.css vs Tailwind layer)
 *  - broken @theme inline token bridge (circular var refs)
 *  - dark theme not following tokens
 */

import { AA_NORMAL, contrastRatio } from '../lib/a11y.mjs';

export async function runTailwindMigrated({ page }) {
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
    // 期望值一律从 token 自身取（`var(--x)` 计算后的 rgb），不再硬编码 hex：
    // 配色换代（P1 Quiet Desk）不该让「token 桥接是否生效」这条断言变红。
    const resolve = (expr) => {
      const d = document.createElement('div');
      d.style.background = expr;
      host.appendChild(d);
      const v = getComputedStyle(d).backgroundColor;
      d.remove();
      return v;
    };
    out.tokens = {
      surface: resolve('var(--surface)'),
      cellEmpty: resolve('var(--color-cell-empty)'),
    };
    wrap.remove();
    return out;
  });

  if (probe.error) return { checks: [['probe injection', false, probe.error]] };

  // token 真的解析出值了（而非透明/空）—— 守住 styles/tokens.css 与 dist 产物的级联顺序：
  // 若 token 文件跑到 dist/sidepanel.css 之前，自引用会生效，var() 全部解析失败。
  add('token 可解析（--surface / --color-cell-empty）',
    probe.tokens.surface !== 'rgba(0, 0, 0, 0)' && probe.tokens.cellEmpty !== 'rgba(0, 0, 0, 0)',
    `${probe.tokens.surface} / ${probe.tokens.cellEmpty}`);

  // 正文阈值 4.5:1（WCAG AA）。断言语义从「比对 hex」改为「算对比度」——
  // 改色不再是红灯，只有真的降到不可读才失败。
  const AA = AA_NORMAL;
  const addContrast = (name, fg, bg) => {
    const r = contrastRatio(fg, bg);
    add(name, r >= AA, `${r.toFixed(2)}:1 (${fg} on ${bg})`);
  };

  add('btn-primary 文字=white', probe.primary.color === 'rgb(255, 255, 255)', probe.primary.color);
  addContrast('btn-primary 对比度 ≥4.5', probe.primary.color, probe.primary.bg);
  add('btn-primary 圆角=6px', probe.primary.radius === '6px', probe.primary.radius);
  add('btn-primary 边框=none', probe.primary.border === 'none', probe.primary.border);

  // btn-secondary: surface 底 + 1px line-2 border + shadow-1（design.md §3.2 outline 变体）。
  // 期望值从 `--surface` token 取，而非写死 rgb —— 换配色不应让门禁变红。
  add('btn-secondary 背景=surface', probe.secondary.bg === probe.tokens.surface, probe.secondary.bg);
  add('btn-secondary 边框=solid', probe.secondary.border === 'solid', probe.secondary.border);

  // section-badge: cell-empty(=sunken) bg + weak text
  add('section-badge 背景=cell-empty', probe.badge.bg === probe.tokens.cellEmpty, probe.badge.bg);

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
  add('暗色主题跟随 token（badge 变暗底）', darkProbe.badgeBg !== probe.badge.bg, darkProbe.badgeBg);
  addContrast('暗色 badge 文字对比度 ≥4.5', darkProbe.badgeColor, darkProbe.badgeBg);
  addContrast('暗色 btn-primary 对比度 ≥4.5', darkProbe.primaryColor, darkProbe.primaryBg);

  return { checks };
}
