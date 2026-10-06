/**
 * reminders.js — 到点提醒（features 层，纯逻辑）
 *
 * 「日程 + 待办」产品最常见的流失原因是：用户必须自己想起来打开侧栏。
 * 本模块只负责**算该提醒哪些卡片**（纯函数，可单测）；
 * 真正的定时与通知在 platform/background.js（Service Worker 才有 chrome.alarms / notifications）。
 *
 * 设计要点：
 *   - 只在「开始时间落入刚刚过去的这一分钟」时提醒一次，避免重复弹。
 *   - 已提醒过的卡片 id 持久化在 `journal.reminded`（{ day, ids[] }），跨 SW 重启不重复。
 *   - 已完成 / 已删除 / 无开始时间的卡片不提醒。
 */

/** 已提醒记录的存储键（chrome.storage.local）。 */
export const REMINDED_KEY = 'journal.reminded';

/**
 * "HH:MM" → 当天分钟数；非法返回 null。
 * @param {string} hhmm
 * @returns {number|null}
 */
export function minuteOf(hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * 时间窗口：`now` 落在 [start, start+windowMinutes) 即视为到点。
 * @param {string} startTime HH:MM
 * @param {string} nowTime HH:MM
 * @param {number} [windowMinutes=1]
 * @returns {boolean}
 */
export function isDue(startTime, nowTime, windowMinutes = 1) {
  const s = minuteOf(startTime);
  const n = minuteOf(nowTime);
  if (s === null || n === null) return false;
  const diff = n - s;
  return diff >= 0 && diff < windowMinutes;
}

/**
 * 选出本次该提醒的卡片。
 * @param {object[]} cards 真源卡片数组
 * @param {string} dayKey 今天 YYYY-MM-DD
 * @param {string} nowTime 现在 HH:MM
 * @param {Set<string>|string[]} alreadyReminded 今天已提醒过的卡片 id
 * @param {number} [windowMinutes=1]
 * @returns {object[]} 待提醒卡片
 */
export function pickDueCards(cards, dayKey, nowTime, alreadyReminded, windowMinutes = 1) {
  const done = new Set(alreadyReminded ?? []);
  return (Array.isArray(cards) ? cards : []).filter((c) => {
    if (!c || c.deleted) return false;
    if (c.assignedDate !== dayKey) return false;
    if (c.status === 'done' || c.done === true) return false;
    if (done.has(c.id)) return false;
    return isDue(c.startTime, nowTime, windowMinutes);
  });
}

/**
 * 通知文案。
 * @param {object} card
 * @returns {{title:string, message:string}}
 */
export function reminderText(card) {
  const label = card.title || card.content || '(空卡片)';
  const time = card.startTime ? `${card.startTime} ` : '';
  const body = card.title && card.content ? card.content : '';
  return {
    title: `${card.emoji || '📓'} ${time}${label}`.trim(),
    message: body || '到点了',
  };
}

/**
 * 把「今天已提醒」记录修剪成当天的（跨天自动清空）。
 * @param {{day?:string, ids?:string[]}|null} record
 * @param {string} dayKey
 * @returns {{day:string, ids:string[]}}
 */
export function pruneReminded(record, dayKey) {
  if (!record || record.day !== dayKey || !Array.isArray(record.ids)) return { day: dayKey, ids: [] };
  return { day: dayKey, ids: record.ids };
}
