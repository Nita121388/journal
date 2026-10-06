/**
 * web.js — 通用浏览器端口实现（**可移植性参考实现，非产品级**）
 *
 * 存在意义：证明 PlatformPort 契约可以脱离 Chrome 实现。
 * 桌面壳（若未来实现）只需照此模式提供"文件存储 + 直连 host + 内嵌启动"即可复用全部 UI。
 *
 * 局限（有意不补齐）：
 *   - storageSubscribe 为 no-op：web 无跨上下文 storage 事件；
 *   - sendMessage / startHost 不支持：web 无 background service worker。
 */

import { DEFAULT_HOST_BASE } from '../shared/protocol.js';

const PREFIX = 'journal.';

/**
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
    console.debug('[platform/web] host offline:', e.message);
    return { ok: false, error: { code: 'HOST_OFFLINE', message: e.message } };
  }
}

/** @returns {import('./index.js').PlatformPort} */
export function createWebPort() {
  return {
    kind: 'web',

    storageGet: async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of list) {
        const raw = localStorage.getItem(PREFIX + k);
        if (raw === null) continue;
        try { out[k] = JSON.parse(raw); } catch { out[k] = raw; }
      }
      return out;
    },

    storageSet: async (obj) => {
      for (const [k, v] of Object.entries(obj)) {
        localStorage.setItem(PREFIX + k, JSON.stringify(v));
      }
    },

    storageSubscribe: () => () => { /* web：无跨上下文 storage 事件 */ },

    sendMessage: async () => ({
      ok: false,
      error: { code: 'NO_BACKGROUND', message: 'web 端口没有 background 运行时' },
    }),

    openOptionsPage: () => { window.location.href = 'options.html'; },
    hostFetch,

    startHost: async () => ({
      ok: false,
      error: 'web 端口不支持自动启动 host，请手动运行 host/server.js',
    }),
  };
}
