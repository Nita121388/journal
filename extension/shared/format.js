/**
 * format.js — 纯展示格式化（shared 叶子）
 *
 * 供各视图共用；无 DOM / 无 storage / 无平台依赖。
 */

import { todayKey } from './model.js';

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
 * 渲染「今天 / 昨天 / 具体日期」。
 * @param {string} dayKey YYYY-MM-DD
 * @returns {string}
 */
export function shortDate(dayKey) {
  const t = todayKey();
  if (dayKey === t) return '今天';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === yesterday.toISOString().slice(0, 10)) return '昨天';
  return dayKey;
}

/**
 * 类型图标：卡片有自定义 emoji 时优先用 emoji，否则用类型默认。
 * @param {string} type
 * @param {string} [emoji]
 * @returns {string}
 */
export function typeIcon(type, emoji = '') {
  if (emoji) return emoji;
  return type === 'task' ? '☑️' : '📝'; // idea 并入文本显示
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
