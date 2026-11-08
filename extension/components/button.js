/**
 * button.js — 按钮基元（components 层）
 *
 * 本阶段只落地「类名契约 + DOM 结构 + 无障碍语义」，视觉由 CSS 承担：
 *   `.btn` + `.btn-{variant}` + `.btn-{size}`，并以 `data-variant` / `data-size`
 *   供 CSS 与 dev-loop 断言使用（不必依赖类名字符串解析）。
 *
 * 变体（design.md §3.2）：
 *   solid   主色实底 —— 每屏唯一主操作（新建 / 保存）
 *   outline 面底 + 描边 + 极弱投影 —— 次要动作（今天 / 取消）
 *   quiet   透明底透明边 —— 工具条常规按钮
 *   ghost   透明底透明边 —— header / section 图标按钮
 * 尺寸：xs=24 / sm=28 / md=32（= --h-ctl-sm / --h-ctl / --h-ctl-lg）
 *
 * ⚠️ DOM 契约（P2 起生效）：既有的 `.btn-primary` / `.btn-secondary` / `.cal-nav-btn` /
 * `.view-wide-btn` / `.pool-tool-btn` / `.skills-toggle-btn` / `.cardpool-add-btn`
 * 将由 CSS 映射到本基元的 `.btn-solid` / `.btn-outline` 等变体，避免一次性改 HTML
 * 造成 dev-loop 断言全面失效。**本阶段不改这些类名对应的 HTML。**
 */

import { icon as makeIcon } from './icon.js';

/** 尺寸档 → 控件高 token（真值在 styles/tokens.css） */
export const BTN_SIZES = { xs: 'var(--h-ctl-sm)', sm: 'var(--h-ctl)', md: 'var(--h-ctl-lg)' };

/** 允许的变体（写错时 console.warn，不 throw —— 一个笔误不该让整页挂掉） */
const VARIANTS = new Set(['solid', 'outline', 'quiet', 'ghost']);
const SIZES = new Set(Object.keys(BTN_SIZES));

/**
 * 内部：装配公共属性。
 *
 * @param {HTMLButtonElement} el
 * @param {object} opts
 * @param {string} opts.variant
 * @param {string} opts.size
 * @param {string} [opts.title]
 * @param {boolean} [opts.pressed]
 * @param {boolean} [opts.disabled]
 * @param {((e: MouseEvent) => void)|null} [opts.onClick]
 */
function decorate(el, { variant, size, title, pressed, disabled, onClick }) {
  const v = VARIANTS.has(variant) ? variant : 'quiet';
  const s = SIZES.has(size) ? size : 'sm';
  if (v !== variant) console.warn(`[button] 未知变体 "${variant}"，已回落 quiet`);
  if (s !== size) console.warn(`[button] 未知尺寸 "${size}"，已回落 sm`);

  el.type = 'button';
  el.className = `btn btn-${v} btn-${s}`;
  el.dataset.variant = v;
  el.dataset.size = s;
  if (title) el.title = title;
  if (pressed !== undefined) el.setAttribute('aria-pressed', String(Boolean(pressed)));
  if (disabled) el.disabled = true;
  if (typeof onClick === 'function') el.addEventListener('click', onClick);
}

/**
 * 创建一个按钮。
 *
 * `label` 一律经 `textContent` 写入（用户内容绝不进 innerHTML）；
 * 传 `icon` 时在前面插一个装饰性 SVG（`aria-hidden`），文本仍由 `label` 承担。
 *
 * @param {object} [opts]
 * @param {string} [opts.label] 可见文本（安全写入）
 * @param {string} [opts.icon] `components/icon.js` 的图标名
 * @param {'solid'|'outline'|'quiet'|'ghost'} [opts.variant='quiet']
 * @param {'xs'|'sm'|'md'} [opts.size='sm']
 * @param {string} [opts.title] 悬浮提示
 * @param {string} [opts.ariaLabel] 覆盖可读名称（如 label 被省略时）
 * @param {boolean} [opts.pressed] 写入 `aria-pressed`（切换型按钮）
 * @param {boolean} [opts.disabled]
 * @param {(e: MouseEvent) => void} [opts.onClick] 仅在传入时绑定
 * @returns {HTMLButtonElement}
 */
export function button({
  label, icon, variant = 'quiet', size = 'sm', title, ariaLabel, pressed, disabled, onClick,
} = {}) {
  const el = document.createElement('button');
  decorate(el, { variant, size, title, pressed, disabled, onClick });
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);

  if (icon) el.append(makeIcon(icon, { size: size === 'xs' ? 16 : 18 }));
  if (label !== undefined && label !== null && label !== '') {
    const span = document.createElement('span');
    span.className = 'btn-label';
    span.textContent = String(label);
    el.append(span);
  }
  return el;
}

/**
 * 创建图标按钮（仅图标；`aria-label` 是硬要求）。
 *
 * 装饰性 SVG 不含语义，可读名称必须由 `label` 提供 —— 缺失或纯空白即开发期错误，
 * 因此这里**故意 throw**：静默渲染一个读屏不可读的按钮比崩溃更糟。
 *
 * @param {object} opts
 * @param {string} opts.name `components/icon.js` 的图标名
 * @param {string} opts.label 可读名称（写入 `aria-label`）
 * @param {'xs'|'sm'|'md'} [opts.size='sm']
 * @param {'solid'|'outline'|'quiet'|'ghost'} [opts.variant='ghost']
 * @param {string} [opts.title]
 * @param {boolean} [opts.pressed]
 * @param {boolean} [opts.disabled]
 * @param {(e: MouseEvent) => void} [opts.onClick]
 * @returns {HTMLButtonElement}
 */
export function iconButton({
  name, label, size = 'sm', variant = 'ghost', title, pressed, disabled, onClick,
} = {}) {
  // 纯空白 label 对读屏等于没有名称（aria-label="   " 读出来是空的），一并拦下
  if (!String(label ?? '').trim()) {
    throw new Error(`[iconButton] 缺少 label（图标按钮必须有 aria-label）：icon="${name}"`);
  }

  const el = document.createElement('button');
  decorate(el, { variant, size, title, pressed, disabled, onClick });
  el.classList.add('btn-icon');
  el.setAttribute('aria-label', label);
  el.append(makeIcon(name, { size: size === 'xs' ? 14 : 16 }));
  return el;
}
