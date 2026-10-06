/**
 * emoji-search.js — emoji 纯搜索（shared 叶子）
 *
 * 只做纯函数检索，不碰 DOM / localStorage。
 * 数据来自 ./emoji-data.js（完整库，含中英文关键词）。
 * 渲染与「最近使用」持久化见 features/emoji.js。
 *
 * 约束（由 ESLint 边界规则强制）：无 DOM / 无 storage / 无 chrome / 无 node:。
 */

import { EMOJI_DB, EMOJI_CATS } from './emoji-data.js';

export { EMOJI_DB, EMOJI_CATS };

/**
 * 搜索 emoji。匹配优先级：emoji 字符 > 短码/名称前缀 > 子串。空查询返回 null。
 * @param {string} query
 * @returns {Array<{e:string,n:string,k:string,c:string}>|null}
 */
export function searchEmojis(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;
  const exact = [];
  const prefix = [];
  const sub = [];
  for (const item of EMOJI_DB) {
    const haystack = `${item.e} ${item.n} ${item.k}`.toLowerCase();
    if (item.e === q) exact.push(item);
    else if (item.k.toLowerCase().includes(q) || item.n.toLowerCase().startsWith(q)) prefix.push(item);
    else if (haystack.includes(q)) sub.push(item);
  }
  return [...exact, ...prefix, ...sub].slice(0, 48);
}

/**
 * 获取某个分类下的 emoji 列表。
 * @param {string} catId
 * @returns {Array<{e:string,n:string,k:string,c:string}>}
 */
export function emojisByCat(catId) {
  return EMOJI_DB.filter(e => e.c === catId);
}

/* ─── 类型 ─────────────────────────────────────────────── */

/**
 * @typedef {object} EmojiItem
 * @property {string} e emoji 字符
 * @property {string} n 英文名
 * @property {string} k 关键词（含中文/拼音，空格分隔）
 * @property {string} c 分类 id
 */
