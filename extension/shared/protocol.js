/**
 * protocol.js — 前后端契约（shared 叶子）
 *
 * host HTTP API 的路由常量与消息类型，以及请求/响应形状的 `@typedef`。
 * 目的：消除 `'/api/cards'` 这类字符串字面量在 host 与 UI 两侧各自散落、
 * 改一端忘另一端的问题。
 *
 * 约束（由 ESLint 边界规则强制）：无 DOM / 无 storage / 无 chrome / 无 node:。
 */

/** host 监听地址（默认端口）。 */
export const DEFAULT_HOST_PORT = 8766;

/** host 基址（UI 侧默认）。 */
export const DEFAULT_HOST_BASE = `http://127.0.0.1:${DEFAULT_HOST_PORT}`;

/**
 * 静态路由。动态路由用 §builders 拼装。
 * @readonly
 */
export const ROUTES = Object.freeze({
  health: '/api/health',

  cards: '/api/cards',
  tags: '/api/tags',
  heatmap: '/api/heatmap',

  journals: '/api/journals',
  todos: '/api/todos',

  skills: '/api/skills',
  skillStatus: '/api/skill-status',

  metaPropertyLibrary: '/api/meta/propertyLibrary',
  metaSavedViews: '/api/meta/savedViews',
  metaTemplates: '/api/meta/templates',

  syncStatus: '/api/sync/status',
  syncConfig: '/api/sync/config',
  syncNow: '/api/sync/now',
  syncTest: '/api/sync/test',
  syncTodos: '/api/sync/todos',

  aiConfig: '/api/ai/config',
  aiProviders: '/api/ai/providers',
  aiInferProp: '/api/ai/infer-prop',
});

/**
 * 动态路由构造器。
 * @param {string} id 卡片 / TODO id
 * @param {string} dayKey YYYY-MM-DD
 * @param {'savedViews'|'propertyLibrary'|'templates'} kind
 */
export const routes = Object.freeze({
  card: (id) => `${ROUTES.cards}/${encodeURIComponent(id)}`,
  journal: (dayKey) => `${ROUTES.journals}/${encodeURIComponent(dayKey)}`,
  todo: (id) => `${ROUTES.todos}/${encodeURIComponent(id)}`,
  meta: (kind) => `/api/meta/${encodeURIComponent(kind)}`,
});

/** 本机 meta 配置的合法 kind（与 host `/api/meta/:kind` 对齐）。 */
export const META_KINDS = Object.freeze(['savedViews', 'propertyLibrary', 'templates']);

/**
 * 扩展内部消息类型（`chrome.runtime.sendMessage` / native messaging）。
 * @readonly
 */
export const MESSAGES = Object.freeze({
  /** 请求 background 通过 native messaging 启动本机 host */
  startHost: 'journal:start-host',
});

/* ─── 传输契约类型 ─────────────────────────────────────── */

/**
 * host API 统一响应包络。
 * @typedef {object} ApiOk
 * @property {true} ok
 * @property {*} [data]
 */

/**
 * @typedef {object} ApiError
 * @property {false} ok
 * @property {{code:string, message:string}} error
 * @property {*} [data]
 */

/**
 * @typedef {ApiOk|ApiError} ApiResult
 */

/**
 * 一张卡片（权威形状由 host 决定；此处仅列 UI 侧关心的字段）。
 * @typedef {object} Card
 * @property {string} id
 * @property {string} content
 * @property {'text'|'task'|'idea'} type
 * @property {boolean} done
 * @property {string} title
 * @property {'none'|'todo'|'doing'|'done'} status
 * @property {number|null} progress
 * @property {number|null} duration
 * @property {Record<string, unknown>} props
 * @property {string|null} project
 * @property {string|null} assignedDate
 * @property {string|null} time
 * @property {string|null} startTime
 * @property {string|null} endTime
 * @property {'high'|'medium'|'low'} priority
 * @property {string[]} tags
 * @property {string} emoji
 * @property {string} createdAt
 * @property {string} updatedAt
 */
