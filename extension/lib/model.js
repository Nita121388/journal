/**
 * model.js — 纯函数层，无 DOM，无 storage 读写，无外部依赖
 * 依赖图：model.js 导入 nothing（纯推导）
 */

/**
 * 生成当天日期 key，格式 "YYYY-MM-DD"
 * @returns {string}
 */
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 将 journals 按天聚合，返回热力图数据：dayKey → 当日条目数
 * @param {Record<string, string>} journals — dayKey → markdown
 * @returns {Record<string, number>}
 */
export function aggregateHeatmap(journals) {
  if (!journals || typeof journals !== 'object') return {};
  const out = {};
  for (const [day, text] of Object.entries(journals)) {
    out[day] = text.length > 0 ? 1 : 0;
  }
  return out;
}

/**
 * 根据 todos 数组生成待办统计摘要
 * @param {Array<{id:string, title:string, done:boolean, due:string|null, priority:string}>} todos
 * @returns {{total:number, done:number, pending:number}}
 */
export function todoSummary(todos) {
  if (!Array.isArray(todos)) return { total: 0, done: 0, pending: 0 };
  const done = todos.filter(t => t.done).length;
  return { total: todos.length, done, pending: todos.length - done };
}

/**
 * 生成 N 天的日期范围数组（含今日），用于热力图渲染
 * @param {number} days — 向前回溯天数，默认 365
 * @returns {string[]} dayKey 数组，从最早到今日
 */
export function dateRange(days = 365) {
  const keys = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}
