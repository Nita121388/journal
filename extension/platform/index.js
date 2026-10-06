/**
 * index.js — 平台端口（PlatformPort）契约 + 运行时选择 + 测试注入
 *
 * 这是 UI/数据层与"具体平台"之间**唯一**的接缝：
 *   - 具体实现：`./chrome.js`（Chrome MV3）、`./web.js`（通用浏览器参考实现）
 *   - 选择逻辑：本文件 `resolvePort()` 按运行环境挑选
 *   - 消费方：通过 `getPort()` 使用能力，**不得** import 具体实现文件
 *
 * 桌面化可行性：只要实现同一份契约（文件系统存储 + 直连 host + 内嵌进程启动），
 * 即可复用全部 UI 代码；本期不实现桌面实现，仅保证契约可替换。
 *
 * @typedef {object} PlatformPort
 * @property {'chrome'|'web'|'desktop'} kind
 * @property {(keys: string|string[]) => Promise<Record<string, unknown>>} storageGet
 * @property {(obj: Record<string, unknown>) => Promise<void>} storageSet
 * @property {(cb: (changes: Record<string, {newValue?: unknown, oldValue?: unknown}>) => void) => (() => void)} storageSubscribe
 * @property {(msg: object) => Promise<object>} sendMessage
 * @property {() => void} openOptionsPage
 * @property {(method: string, path: string, body?: object|null) => Promise<
 *   {ok: true, data?: any} | {ok: false, error: {code: string, message: string}}>} hostFetch
 * @property {() => Promise<{ok: boolean, error?: string}>} startHost
 */

import { createChromePort } from './chrome.js';
import { createWebPort } from './web.js';

/** @type {PlatformPort|null} */
let current = null;

/** 是否运行在 Chrome 扩展运行时（有 chrome.runtime.id）。 */
export function isChromeRuntime() {
  return typeof chrome !== 'undefined' && Boolean(chrome?.runtime?.id);
}

/** 按运行环境选择端口实现。 */
export function resolvePort() {
  return isChromeRuntime() ? createChromePort() : createWebPort();
}

/**
 * 注入端口（测试注入 fake / 桌面壳注入自己的实现）。
 * @param {PlatformPort} port
 * @returns {PlatformPort}
 */
export function setPort(port) {
  current = port;
  return port;
}

/** 获取当前端口（惰性解析并缓存）。 */
export function getPort() {
  if (!current) current = resolvePort();
  return current;
}
