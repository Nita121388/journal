/* ================================================================
   Journal — model.js
   数据模型、ID 生成、日期工具。纯函数，无 chrome 依赖。
   ================================================================ */

'use strict';

export const SCHEMA_VERSION = 1;

/** 生成唯一 id：时间前缀 + 随机段 */
export function uid(prefix = 'j') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

/** 日期工具：YYYY-MM-DD */
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function parseDate(dateStr) {
  const [y, m, d] = (dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** 星期几（0=日, 1=一 ... 6=六），给定 YYYY-MM-DD */
export function dayOfWeek(dateStr) {
  return (parseDate(dateStr) || new Date()).getDay();
}

/** 月份天数 */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** 月份第一天是星期几 */
export function firstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

/** 中文星期 */
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 月份中文名 */
export function monthName(month) {
  const names = ['一月', '二月', '三月', '四月', '五月', '六月',
                 '七月', '八月', '九月', '十月', '十一月', '十二月'];
  return names[month - 1] || '';
}

/** 语义化版本比较 */
export function isNewerVersion(a, b) {
  const va = (a || '').split('.').map(Number);
  const vb = (b || '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((va[i] || 0) !== (vb[i] || 0)) return (va[i] || 0) > (vb[i] || 0);
  }
  return false;
}

/** 空白状态（首次安装 / 重置用） */
export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    days: [],       // [{date:'2025-09-13', content:'', createdAt, updatedAt, deletedAt:null}]
    todos: [],      // [{id, text, done:false, priority:'medium', dueDate:null, createdAt, updatedAt, deletedAt:null}]
    settings: {
      syncProvider: 'off',  // off | webdav
      webdav: { server: '', user: '', password: '', path: 'journal/data.json' },
      hostPort: 23517,
      hostToken: '',
    },
    sync: {
      deviceId: '',
      lastSyncAt: null,
      rev: 0,
      dailySyncs: {},
      lastSyncedSig: '',
    },
  };
}

/** 找到指定日期的日条目（已删除的不算） */
export function findDay(days, dateStr) {
  return days.find(d => d.date === dateStr && !d.deletedAt) || null;
}
