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
 * 解析 `rgb(r, g, b)` / `rgba(r, g, b, a)` 为 [0..1] 三通道。
 * @param {string} s
 * @returns {[number, number, number]|null}
 */
export function parseRgb(s) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s || '');
  return m ? [1, 2, 3].map((i) => Number(m[i]) / 255) : null;
}

/**
 * WCAG 相对亮度对比度（1:1 ~ 21:1）。
 * @param {string} fg 'rgb(r, g, b)'
 * @param {string} bg 'rgb(r, g, b)'
 * @returns {number} 无法解析时返回 0（断言会因此失败，而不是静默通过）
 */
export function contrastRatio(fg, bg) {
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const a = parseRgb(fg);
  const b = parseRgb(bg);
  if (!a || !b) return 0;
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
