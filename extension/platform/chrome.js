/**
 * chrome.js — Chrome MV3 平台端口实现
 *
 * 全仓唯一允许直接引用 `chrome.*` 的业务文件之一（另一个是 background.js）。
 * 所有 `chrome` 引用都封装在函数内部，不在模块顶层求值，
 * 以便该模块在非 Chrome 环境被安全 import（web 端口并存）。
 */

import { DEFAULT_HOST_BASE } from '../shared/protocol.js';
import { MESSAGES } from '../shared/protocol.js';

/**
 * 走 host HTTP 接口。host 离线时返回结构化错误（不 throw）。
 * @param {string} method
 * @param {string} path
 * @param {object|null} [body]
 */
async function hostFetch(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null && body !== undefined) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${DEFAULT_HOST_BASE}${path}`, opts);
    return await res.json();
  } catch (e) {
    console.debug('[platform/chrome] host offline:', e.message);
    return { ok: false, error: { code: 'HOST_OFFLINE', message: e.message } };
  }
}

/** @returns {import('./index.js').PlatformPort} */
export function createChromePort() {
  return {
    kind: 'chrome',

    storageGet: (keys) => chrome.storage.local.get(keys),
    storageSet: (obj) => chrome.storage.local.set(obj),

    storageSubscribe: (cb) => {
      const listener = (changes) => cb(changes);
      chrome.storage.local.onChanged.addListener(listener);
      return () => chrome.storage.local.onChanged.removeListener(listener);
    },

    sendMessage: (msg) => chrome.runtime.sendMessage(msg),
    openOptionsPage: () => chrome.runtime.openOptionsPage(),
    hostFetch,

    /** 经 background 的 native messaging 启动本机 host。 */
    startHost: async () => {
      try {
        const result = await chrome.runtime.sendMessage({ type: MESSAGES.startHost });
        return { ok: Boolean(result?.ok), error: result?.error || '' };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
  };
}
