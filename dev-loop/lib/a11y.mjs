/**
 * a11y.mjs — 可访问性断言工具（dev-loop 共用）
 *
 * 为什么单独抽出来：`scenarios/*.mjs` 需要在页面里算对比度，
 * 之前只有一个场景有这套公式；重复实现会慢慢分叉。
 *
 * 用法（在 scenario 内）：
 *   import { contrastRatio, AA_NORMAL } from '../lib/a11y.mjs';
 *   add('xx 对比度 ≥4.5', contrastRatio(fg, bg) >= AA_NORMAL, `${fg} on ${bg}`);
 */

/** WCAG AA 正常字号阈值 */
export const AA_NORMAL = 4.5;
/** WCAG AA 大字号（≥18.66px 粗体 / 24px）阈值 */
export const AA_LARGE = 3;

/**
 * 解析 `rgb(r, g, b)` / `rgba(r, g, b, a)` 为 RGB + alpha。
 *
 * **必须解析 alpha**：半透明前景（如 `rgba(255,255,255,0.5)`）若不与背景合成，
 * 算出来的对比度会严重偏高 —— 那种"看起来通过其实不可读"的假绿正是评审点名的坑。
 * @param {string} s
 * @returns {{rgb: [number, number, number], a: number}|null}
 */
export function parseRgb(s) {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(s || '');
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Number(m[4]);
  return { rgb: [1, 2, 3].map((i) => Number(m[i]) / 255), a: Number.isFinite(a) ? a : 1 };
}

/** 把带 alpha 的前景合成到不透明背景上（`over` 运算）。 */
function composite(fg, bg) {
  if (fg.a >= 1) return fg.rgb;
  return fg.rgb.map((c, i) => c * fg.a + bg.rgb[i] * (1 - fg.a));
}

/**
 * WCAG 相对亮度对比度（1:1 ~ 21:1）。
 * @param {string} fg 'rgb()/rgba()'
 * @param {string} bg 不透明背景 'rgb()/rgba()'
 * @returns {number} 无法解析时返回 0（断言会因此失败，而不是静默通过）
 */
export function contrastRatio(fg, bg) {
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const f = parseRgb(fg);
  const b = parseRgb(bg);
  if (!f || !b) return 0;
  // 背景若也半透明，退化为与白/黑取较亮结果会产生乐观偏差；此处按不透明处理并标注。
  const fgRgb = composite(f, b);
  const [hi, lo] = [lum(fgRgb), lum(b.rgb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
