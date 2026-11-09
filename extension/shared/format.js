/**
 * format.js — 纯展示格式化（shared 叶子）
 *
 * 供各视图共用；无 DOM / 无 storage / 无平台依赖。
 */

import { todayKey, toDayKey } from './model.js';

/**
 * 长日期标签，如「2026年10月6日星期二」。
 * @param {string} dayKey YYYY-MM-DD
 * @returns {string}
 */
export function formatDateLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

/**
 * 卡片的主文本：标题优先，其次内容。
 *
 * 卡片池、时间线、月/周摘要统一用它，避免同一张卡在不同视图显示不同文字
 * （历史上池用 `title || content`，时间线只用 `content`，只有标题的卡会显示“空卡片”）。
 * @param {object} card
 * @param {string} [fallback='(空卡片)']
 * @returns {string}
 */
export function cardPrimaryText(card, fallback = '(空卡片)') {
  return card?.title || card?.content || fallback;
}

/**
 * 紧凑日期标签，如「10月6日 周二」（非当年时补年份）。
 *
 * 侧边栏最窄只有 320px，主视图标题会与右侧工具组抢空间；
 * `formatDateLabel`（2026年10月6日星期二）会直接被挤成 0 宽，故单独提供短式。
 * @param {string} dayKey YYYY-MM-DD
 * @returns {string}
 */
export function compactDateLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wk = '日一二三四五六'[dt.getUTCDay()];
  const yearPrefix = y === new Date().getFullYear() ? '' : `${y}年`;
  return `${yearPrefix}${m}月${d}日 周${wk}`;
}

/**
 * 渲染「今天 / 昨天 / 具体日期」。
 * @param {string} dayKey YYYY-MM-DD
 * @returns {string}
 */
export function shortDate(dayKey) {
  const t = todayKey();
  if (dayKey === t) return '今天';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  // 必须用本地字段构造 dayKey：`toISOString()` 在 UTC+8 的 00:00–08:00
  // 会算成前一天，导致“昨天”标签整体错一天（与 shared/model 的策略一致）。
  if (dayKey === toDayKey(yesterday)) return '昨天';
  return dayKey;
}

/**
 * HTML 转义（**唯一实现处**）。所有把文本拼进 HTML 字符串的地方都必须过它。
 * 新代码优先用 DOM API（`textContent` / `createElement`），本函数用于确实需要拼字符串的场景。
 * @param {unknown} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 清洗用户提供的"自定义图标"。
 *
 * emoji 合法取值**永不需要** HTML 元字符，因此这里直接拒绝含 `< > & " ' \`` 的输入，
 * 并限制长度（防用长字符串做注入/撑版）。经此过滤后，返回值可安全放进 HTML 文本位置。
 *
 * 注入来源不止手输：AI 建卡、导入、多端同步回来的卡片都可能带任意 emoji 字符串。
 * @param {unknown} raw
 * @returns {string} 安全图标（不合法则空串）
 */
export function sanitizeEmoji(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 8) return '';
  if (/[<>&"'`]/.test(s)) return '';
  return s;
}

/**
 * 类型图标：卡片有自定义 emoji 时优先用 emoji，否则用类型默认。
 *
 * @deprecated 2026-11-09 类型（text|task|idea）已退出 UI，视图层不再调用本函数 ——
 * 卡片默认图标改用 `components/card-icon.js` 的 `cardIconEl()`（note 线稿 SVG）。
 * 暂留一个版本供历史数据/第三方脚本使用，下个版本清理。
 *
 * 返回值**保证不含 HTML 元字符**（经 {@link sanitizeEmoji}），
 * 因此可安全地拼进 `innerHTML`。
 * @param {string} type
 * @param {string} [emoji]
 * @returns {string}
 */
export function typeIcon(type, emoji = '') {
  const safe = sanitizeEmoji(emoji);
  if (safe) return safe;
  return type === 'task' ? '☑️' : type === 'idea' ? '💡' : '📝';
}

const ORIGIN_LABEL = {
  human: '👤 人类',
  'agent-assisted': '🤖 人类驱动 agent',
  'agent-auto': '⚙️ 自动',
};

/**
 * 来源事件 → 展示文案（纯展示）。
 * @param {{origin?:string,agent?:string,model?:string,project?:string,device?:{hostname?:string},at?:string}} ev
 * @param {string} [fallback='—']
 * @returns {string}
 */
export function formatProvenance(ev, fallback = '—') {
  if (!ev) return fallback;
  const label = ORIGIN_LABEL[ev.origin] ?? '👤 人类';
  const parts = [label];
  if (ev.agent) parts.push(ev.agent);
  if (ev.model) parts.push(ev.model);
  if (ev.project) parts.push(ev.project);
  if (ev.device?.hostname) parts.push(ev.device.hostname);
  if (ev.at) parts.push(new Date(ev.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
  return parts.join(' · ');
}

/** 卡片配色键全集（与 tokens.css 的 `--cc-*` 色系一一对应）。 */
export const CARD_COLOR_KEYS = Object.freeze(['red', 'green', 'blue', 'purple', 'gray']);

/** 标签名 → 稳定配色键：同名标签恒得同色（FNV-1a 取模，纯函数无状态）。 */
function colorFromTag(tag) {
  const s = String(tag ?? '');
  if (!s) return 'gray';
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return CARD_COLOR_KEYS[h % 4]; // 前 4 个是彩色，gray 只留给兜底
}

/**
 * 卡片 → 配色键（月/周/日视图共用，保证同一张卡在所有视图同色）。
 *
 * 优先级：显式 `props.color`（用户手选） > 类型 > 首个标签兜底 > gray。
 * 类型映射刻意区分 task / text：参考图里任务偏暖色、记录偏冷色。
 * @param {object} card
 * @returns {'red'|'green'|'blue'|'purple'|'gray'}
 */
export function cardColorKey(card) {
  const explicit = card?.props?.color;
  if (typeof explicit === 'string' && CARD_COLOR_KEYS.includes(explicit)) return explicit;
  const type = card?.type;
  if (type === 'task') return card?.done ? 'gray' : 'red';
  if (type === 'text' || type === 'idea') {
    const firstTag = Array.isArray(card?.tags) ? card.tags[0] : null;
    return firstTag ? colorFromTag(firstTag) : 'blue';
  }
  const firstTag = Array.isArray(card?.tags) ? card.tags[0] : null;
  return firstTag ? colorFromTag(firstTag) : 'gray';
}
