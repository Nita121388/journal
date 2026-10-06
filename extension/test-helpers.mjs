/**
 * test-helpers.mjs — vitest 用的假平台端口（位于 extension 根，不纳入覆盖率统计）
 *
 * 用法：
 *   import { setPort } from './platform/index.js';
 *   import { makePort } from '../test-helpers.mjs';
 *   setPort(makePort({ cards: [...] }));
 */

/** 内存版 PlatformPort。 */
export function makePort(initial = {}) {
  const store = { ...(initial.storage || {}) };
  const calls = [];
  const fetchQueue = [...(initial.responses || [])];

  return {
    kind: 'test',
    calls,

    async storageGet(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of list) if (k in store) out[k] = store[k];
      return out;
    },
    async storageSet(obj) {
      Object.assign(store, obj);
    },
    storageSubscribe() {
      return () => {};
    },
    async sendMessage(msg) {
      calls.push({ kind: 'sendMessage', msg });
      return { ok: true };
    },
    openOptionsPage() {
      calls.push({ kind: 'openOptionsPage' });
    },
    prefGet(key) {
      return store[key] ?? null;
    },
    prefSet(key, value) {
      store[key] = value;
    },
    prefRemove(key) {
      delete store[key];
    },

    /** 依次吐出 initial.responses 里的响应；用尽后返回 offline。 */
    async hostFetch(method, path, body = null) {
      calls.push({ kind: 'hostFetch', method, path, body });
      const next = fetchQueue.shift();
      if (next === undefined) return { ok: false, error: { code: 'HOST_OFFLINE', message: 'test: no response' } };
      if (typeof next === 'function') return next(method, path, body);
      return next;
    },

    async startHost() {
      calls.push({ kind: 'startHost' });
      return { ok: true };
    },

    /** 测试内省 */
    _store: store,
    _pushResponse(resp) { fetchQueue.push(resp); },
  };
}

/** 构造 host API 成功包络。 */
export function apiOk(data) {
  return { ok: true, data };
}

/** 把 cards 数组包成 /api/cards 的响应。 */
export function cardsResponse(cards) {
  return apiOk(cards);
}
