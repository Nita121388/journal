/**
 * card-icon.js — 卡片图标原子（components 层）
 *
 * 背景：`type`（text | task | idea）已退出 UI —— 卡片形态由模板承担。
 * 因此卡片默认图标不再按类型给 📝 / ☑️ / 💡（功能 emoji），改为：
 *   - 用户自选了 emoji → 用 emoji（内容 emoji 允许）
 *   - 否则 → `note` 线稿 SVG（currentColor，跟随文字色）
 *
 * 只产出 DOM，不读数据；className 由调用方指定以沿用既有布局类名
 * （`.card-type-icon` / `.cardpool-type-icon` / `.cc-pill-icon`）。
 */

import { icon } from './icon.js';
import { sanitizeEmoji } from '../shared/format.js';

/**
 * @param {{emoji?: string}} card
 * @param {{cls?: string, size?: number}} [opts]
 * @returns {HTMLElement} `<span class="cls">` 内含 emoji 文本或 note 图标
 */
export function cardIconEl(card, { cls = 'card-type-icon', size = 12 } = {}) {
  const el = document.createElement('span');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  const emoji = sanitizeEmoji(card?.emoji ?? '');
  if (emoji) {
    el.textContent = emoji;
  } else {
    el.append(icon('note', { size }));
  }
  return el;
}
