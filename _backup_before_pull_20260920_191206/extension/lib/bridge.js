/* ================================================================
   Journal — bridge.js
   扩展端 WebSocket 客户端：连接本机 journal-host，
   让本机 agent（经 host 的 MCP）操作扩展数据。
   请求格式与 tabshelf-host 一致：{ type:'hello', token } 握手，
   之后 { type:'req', id, method, params } / { type:'res', id, result }。
   ================================================================ */

'use strict';

import { getState, getDayContent, setDayContent, addTodo, toggleTodo, updateTodo, deleteTodo, listTodos, listRecordedDates } from './store.js';
import { todayStr } from './model.js';

let ws = null;
let token = '';
let port = 23517;
let reconnectTimer = null;
let nextId = 1;
const pending = new Map();
const listeners = new Set();   // 连接状态变更订阅

function hostConfig() {
  const s = getState().settings;
  token = s.hostToken || '';
  port = s.hostPort || 23517;
}

/** 连接状态订阅 */
export function onHostStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitStatus(status) {
  listeners.forEach(fn => fn(status));
}

export function getHostStatus() {
  return {
    connected: !!ws && ws.readyState === WebSocket.OPEN,
    tokenSet: !!token,
  };
}

/** 建立连接（自动重连，退避 3s→30s） */
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  hostConfig();
  if (!token) {
    emitStatus({ connected: false, reason: 'no-token' });
    return;
  }
  try {
    ws = new WebSocket(`ws://127.0.0.1:${port}`);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'hello', token, client: 'extension' }));
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'hello_res') {
      if (msg.ok) {
        emitStatus({ connected: true });
      } else {
        emitStatus({ connected: false, reason: msg.error || 'bad-token' });
        ws.close();
      }
      return;
    }
    if (msg.type === 'res' && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
      return;
    }
    // host 发来的 RPC 请求（由本机 agent 经 MCP 触发）→ 执行后回包
    if (msg.type === 'req') {
      const handler = agentHandlers[msg.method];
      Promise.resolve()
        .then(() => handler ? handler(msg.params || {}) : Promise.reject(new Error('unknown method: ' + msg.method)))
        .then(
          result => ws.send(JSON.stringify({ type: 'res', id: msg.id, result })),
          error => ws.send(JSON.stringify({ type: 'res', id: msg.id, error: String(error?.message || error) }))
        );
    }
  };
  ws.onclose = () => {
    emitStatus({ connected: false });
    scheduleReconnect();
  };
  ws.onerror = () => {
    try { ws.close(); } catch {}
  };
}

let backoff = 3000;
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    backoff = Math.min(backoff * 2, 30000);
    connect();
  }, backoff);
}

/** 主动重连（配置变化后调用） */
export function reconnect() {
  backoff = 3000;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  try { ws?.close(); } catch {}
  ws = null;
  connect();
}

/** 向 host 发请求（host → 扩展的 RPC，由 MCP 工具触发） */
async function extRequest(method, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('host 未连接：请启动 journal-host 并在设置里填 token');
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`RPC timeout: ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
  });
}

/* ─── Agent 可调用的方法（经 bridge request 进来） ───────────── */

export const agentHandlers = {
  /** 读某天日志 */
  journal_get_day: async ({ date }) => {
    const d = date || todayStr();
    return { date: d, content: getDayContent(d) };
  },

  /** 写入某天日志（覆盖）；content 空 → 清理 */
  journal_update_day: async ({ date, content }) => {
    const d = date || todayStr();
    const res = await setDayContent(d, content || '');
    return { ok: true, date: d, created: res.created };
  },

  /** 追加到某天日志末尾 */
  journal_append_day: async ({ date, content }) => {
    const d = date || todayStr();
    const existing = getDayContent(d);
    const merged = existing ? existing + '\n' + content : content;
    await setDayContent(d, merged);
    return { ok: true, date: d, appended: true };
  },

  /** 列出所有有记录的日期（热力图） */
  journal_list_dates: async () => {
    return { dates: [...listRecordedDates()].sort() };
  },

  /** 查看某段时间的日志（用于总结） */
  journal_list_range: async ({ from, to }) => {
    const { getState } = await import('./store.js');
    const days = getState().days
      .filter(d => !d.deletedAt && d.content.trim() && (!from || d.date >= from) && (!to || d.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ date: d.date, content: d.content }));
    return { days };
  },

  /** 新增待办 */
  journal_add_todo: async ({ text, dueDate, priority }) => {
    const t = await addTodo({ text, dueDate: dueDate || null, priority: priority || 'medium' });
    return { ok: true, id: t.id, text: t.text, dueDate: t.dueDate, priority: t.priority };
  },

  /** 列出待办 */
  journal_list_todos: async ({ dueDate, done }) => {
    const items = listTodos({ dueDate: dueDate || null, done });
    return { todos: items.map(t => ({ id: t.id, text: t.text, done: t.done, priority: t.priority, dueDate: t.dueDate })) };
  },

  /** 切换待办完成状态 */
  journal_toggle_todo: async ({ id }) => {
    const t = await toggleTodo(id);
    return t ? { ok: true, id, done: t.done } : { ok: false, error: 'not found' };
  },

  /** 更新待办 */
  journal_update_todo: async ({ id, text, done, priority, dueDate }) => {
    const t = await updateTodo(id, { text, done, priority, dueDate });
    return t ? { ok: true, id } : { ok: false, error: 'not found' };
  },

  /** 删除待办 */
  journal_delete_todo: async ({ id }) => {
    const ok = await deleteTodo(id);
    return { ok };
  },

  /** 导出全部数据 */
  journal_export: async () => {
    const { getState } = await import('./store.js');
    return { days: getState().days, todos: getState().todos };
  },
};