/**
 * prop-llm.js — 模板属性推断的 LLM 增强层（扩展侧）
 *
 * 依赖图：prop-llm.js → prop-infer.js（本地规则）+ host-sync.js（host 代理）
 *
 * 设计要点：
 *  - prop-infer.js 保持纯本地、永不联网；本模块是唯一的 LLM 入口。
 *  - 触发策略（settings.ai.inferMode）：auto（默认）/ always / never
 *  - **永不 throw**：任何网络/解析错误等价于返回本地结果（UI 不崩、不弹错）
 *  - 结果缓存到 chrome.storage.local（按 name），重复属性名不重复计费
 */

import { inferProp, defaultValueForType } from './prop-infer.js';
import { hostApi } from './host-sync.js';

const CACHE_KEY = 'ai.inferCache';
const CACHE_MAX = 200;

/* ── 缓存 ─────────────────────────────────────────────── */

/** 缓存键：name + model（换模型/换 provider 后旧建议不命中） */
function cacheKey(name, model = '') {
  return model ? `${name}::${model}` : name;
}

async function readCache() {
  const { [CACHE_KEY]: raw } = await chrome.storage.local.get(CACHE_KEY);
  return (raw && typeof raw === 'object') ? raw : {};
}

async function writeCache(entry) {
  const cache = await readCache();
  cache[cacheKey(entry.name, entry.model)] = { def: entry.def, model: entry.model || '', ts: Date.now() };
  // 简单 LRU 上限保护（防无限增长）
  const keys = Object.keys(cache);
  if (keys.length > CACHE_MAX) {
    keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
    for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete cache[k];
  }
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

/* ── 主入口 ───────────────────────────────────────────── */

/**
 * 双层推断：本地规则 +（可选）LLM 增强。
 * @param {string} name 属性名
 * @param {{ mode?: 'auto'|'always'|'never', force?: boolean }} opts
 *   mode: 触发策略（默认 'auto'）；force: 强制调 LLM（绕过 auto 判断）
 * @returns {Promise<{...localDef, source:'local'|'cached'|'llm'|'fallback', llm?:object|null}>}
 *   永不 reject（内部全兜底）
 */
export async function inferPropWithLLM(name, { mode = 'auto', force = false } = {}) {
  const local = inferProp(name, { existingKeys: [] });

  // never：只用本地
  if (mode === 'never') return { ...local, source: 'local', llm: null };

  // auto：本地规则命中（高置信）且非强制 → 不发请求
  if (mode === 'auto' && local.confidence === 'rule' && !force) {
    return { ...local, source: 'local', llm: null };
  }

  // 缓存：命中直接返回（仅对会触发 LLM 的名字查缓存）
  try {
    const cache = await readCache();
    const hit = cache[cacheKey(name)];
    if (hit) {
      return { ...local, ...hit.def, source: 'cached', llm: hit.def, confidence: 'llm' };
    }
  } catch { /* 缓存读失败忽略 */ }

  // 调 host 代理（永不 throw）
  try {
    const { ok, data } = await hostApi('POST', '/api/ai/infer-prop', {
      name,
      local: { icon: local.icon, type: local.type, options: local.options ?? null },
    });
    if (!ok) return { ...local, source: 'fallback', llm: null };
    if (!data) return { ...local, source: 'fallback', llm: null };

    // 未配置 / LLM 失败：回落本地
    if (data.source !== 'llm') {
      return { ...local, source: 'fallback', llm: null };
    }

    // LLM 成功：规范化并缓存
    const llmDef = {
      icon: typeof data.icon === 'string' && data.icon ? data.icon : local.icon,
      type: data.type || local.type,
      options: data.options && data.options.length ? [...data.options] : undefined,
      defaultValue: data.defaultValue !== undefined ? data.defaultValue : defaultValueForType(data.type || local.type),
    };
    const result = { ...local, ...llmDef, source: 'llm', llm: llmDef, confidence: 'llm' };
    try {
      await writeCache({ name, def: llmDef, model: data.model || '' });
    } catch { /* 缓存写失败忽略 */ }
    return result;
  } catch (e) {
    console.debug('[prop-llm] LLM infer failed, using local:', e?.message ?? e);
    return { ...local, source: 'fallback', llm: null };
  }
}
