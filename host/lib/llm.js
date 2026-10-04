/**
 * llm.js — LLM 代理层（host 侧）
 *
 * 职责：
 *  - 读取 host/data/config.json（provider/baseURL/model/apiKey/timeoutMs/enabled）
 *  - 裸 fetch 调 OpenAI 兼容 /chat/completions（零依赖；协议层单点封装，未来换 SDK 只改 chatCompletions）
 *  - 结构化输出三级降级链：json_schema → json_object → prompt-only（去围栏 + 括号扫描 + 校验修复）
 *  - 错误分类：not_configured / llm_failed（对外统一 source: 'fallback'）
 *
 * 安全：API key 永不写入日志、永不进入响应。日志只含元数据（provider/model/耗时/错误类型）。
 *
 * 可测试：所有外部 I/O 通过注入 fetchImpl（默认 globalThis.fetch），单测不联网。
 */

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProtocol, needsApiKey, PROVIDER_INFO, SUGGESTED_MODELS, FIXED_CRED_PROVIDERS, PROVIDER_LOGO_MAP } from './llm-providers.js';

export { PROVIDER_INFO, SUGGESTED_MODELS, FIXED_CRED_PROVIDERS, PROVIDER_LOGO_MAP, resolveProtocol, needsApiKey };

const __dirname = dirname(fileURLToPath(import.meta.url));
/** 配置文件位置：host/data/config.json（gitignore，用户填 key） */
const CONFIG_PATH = process.env.JOURNAL_AI_CONFIG || join(__dirname, '..', 'data', 'config.json');

/** 原子写配置：temp → rename（防 crash 留半文件）；apiKey 空串/省略 = 不改已有 key */
export function writeConfig(patch, path = CONFIG_PATH) {
  if (!patch || typeof patch !== 'object') throw new Error('invalid config patch');
  let cur = {};
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') cur = parsed;
  } catch { /* 无文件或非法 JSON → 按新写 */ }
  const next = { ...cur };
  for (const k of ['provider', 'baseURL', 'model', 'timeoutMs', 'enabled']) {
    if (patch[k] !== undefined) next[k] = patch[k];
  }
  if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) next.apiKey = patch.apiKey;
  // 最小校验：baseURL/model 为字符串时去空格
  if (typeof next.baseURL === 'string') next.baseURL = next.baseURL.trim();
  if (typeof next.model === 'string') next.model = next.model.trim();
  writeFileSync(`${path}.tmp`, JSON.stringify(next, null, 2), 'utf-8');
  renameSync(`${path}.tmp`, path);
  return next;
}

/** 属性类型全集（与扩展 lib/prop-infer.js 的 PROP_TYPES 对齐） */
export const PROP_TYPES = [
  'text', 'textarea', 'number', 'select', 'multi',
  'date', 'time', 'checkbox', 'schedule', 'tags', 'status',
];

/** 结构化输出 JSON Schema（OpenAI json_schema 模式） */
export const PROP_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: PROP_TYPES },
    options: { type: ['array', 'null'], items: { type: 'string' } },
    icon: { type: 'string' },
    defaultValue: {},
  },
  required: ['type', 'options', 'icon'],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  '你是属性推断助手。给定一个中文/英文属性名，判断它应是什么类型的属性。' +
  `可选类型：${PROP_TYPES.join('/')}。` +
  '只输出一个 JSON 对象，字段：{"type":"<类型>","options":["选项1","选项2"] 或 null,"icon":"<一个 emoji>","defaultValue":"<该类型的空默认值>"}。' +
  'options 仅当 type 是 select/multi 时提供候选列表（2-5 个），否则为 null。' +
  '不要输出任何解释文字，不要用 markdown 围栏。';

/** 默认值按类型兜底（与扩展 defaultValueForType 一致） */
function emptyDefault(type) {
  if (type === 'checkbox') return false;
  if (type === 'tags') return [];
  if (type === 'schedule') return null;
  return '';
}

/* ── 配置读取 ──────────────────────────────────────────── */

/**
 * 读取 AI 配置。文件缺失/非法 JSON/未填 key 均视为未配置。
 * @returns {{provider:string, baseURL:string, model:string, apiKey:string, timeoutMs:number, enabled:boolean}|null}
 */
export function readConfig(path = CONFIG_PATH) {
  let raw;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return null; // 文件不存在 → 未配置
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return null; // 非法 JSON → 视为未配置，不 crash
  }
  if (!cfg || typeof cfg !== 'object') return null;
  const apiKey = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : '';
  const baseURL = typeof cfg.baseURL === 'string' ? cfg.baseURL.trim().replace(/\/+$/, '') : '';
  const model = typeof cfg.model === 'string' ? cfg.model.trim() : '';
  const provider = typeof cfg.provider === 'string' ? cfg.provider.trim() : '';
  // 无需 API Key 的服务商（本地模型 ollama 等）允许空 key；其余仍要求 key
  if ((needsApiKey(provider) && !apiKey) || !baseURL || !model) return null;
  return {
    provider,
    baseURL,
    model,
    apiKey,
    timeoutMs: Number.isFinite(cfg.timeoutMs) ? cfg.timeoutMs : 15000,
    enabled: cfg.enabled !== false,
  };
}

/** 配置是否可用 */
export function isConfigured(cfg) {
  if (!cfg || !cfg.enabled || !cfg.baseURL || !cfg.model) return false;
  // 无需 API Key 的服务商（本地模型等）不要求 key
  return needsApiKey(cfg.provider) ? Boolean(cfg.apiKey) : true;
}

/** baseURL 去重拼接 /chat/completions（兼容 baseURL 带不带 /v1） */
export function chatCompletionsURL(baseURL) {
  const root = baseURL.replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(root)) return root;
  if (/\/v\d$/.test(root) || /\/v\d\/$/.test(root + '/')) return `${root}/chat/completions`;
  return `${root}/v1/chat/completions`;
}

/* ── 纯解析工具（可单测） ─────────────────────────────── */

/** 去围栏 + 平衡括号扫描，从任意文本中提取第一个 JSON 对象字符串 */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  let t = text.trim();
  // 剥 ```json / ``` 围栏
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();
  // 找第一个 '{'，做平衡扫描
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return null;
}

/** 解析 + 校验修复，返回规范化属性定义；失败返回 null */
export function normalizePropDef(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const type = PROP_TYPES.includes(parsed.type) ? parsed.type : null;
  if (!type) return null;
  let options = null;
  if (type === 'select' || type === 'multi') {
    if (Array.isArray(parsed.options)) {
      options = parsed.options
        .filter((o) => typeof o === 'string' && o.trim())
        .map((o) => o.trim())
        .slice(0, 12);
      if (!options.length) options = null;
    }
  }
  return {
    type,
    options,
    icon: typeof parsed.icon === 'string' && parsed.icon ? parsed.icon : null,
    defaultValue: emptyDefault(type),
  };
}

/* ── 协议层（单点封装，未来换 SDK 只改这里） ─────────────── */

/**
 * 调用一次 LLM（按服务商分派协议：openai 兼容 / anthropic / gemini）。
 * @param {object} cfg 配置（含 provider）
 * @param {object} body openai 风格的归一化 body（model/messages/response_format 或 structured 标记）
 * @param {function} fetchImpl 注入的 fetch（默认 globalThis.fetch）
 * @returns {Promise<{ok:boolean, status?:number, content?:string, error?:string}>}
 */
export async function chatCompletions(cfg, body, fetchImpl = globalThis.fetch) {
  const protocol = resolveProtocol(cfg.provider);
  const { url, headers, payload } = buildRequest(cfg, body, protocol);

  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(cfg.timeoutMs || 15000),
    });
  } catch (e) {
    return { ok: false, error: e?.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
  if (!res || !res.ok) {
    return { ok: false, status: res?.status ?? 0, error: `http_${res?.status ?? 0}` };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'bad_json' };
  }
  const content = extractProtocolContent(data, protocol);
  if (typeof content !== 'string' || !content) {
    return { ok: false, error: 'empty_content' };
  }
  return { ok: true, content };
}

/* ── 协议适配：openai / anthropic / gemini ──────────────── */

/** 按协议构造 url + headers + body（输入为归一化 openai 风格 body） */
function buildRequest(cfg, body, protocol) {
  const model = cfg.model;
  const sys = body.messages?.[0]?.content ?? SYSTEM_PROMPT;
  const user = body.messages?.[1]?.content ?? '';
  const structured = body.response_format?.type; // 'json_schema' | 'json_object' | undefined

  if (protocol === 'anthropic') {
    const root = cfg.baseURL.replace(/\/+$/, '');
    const url = /\/messages$/.test(root) ? root : `${root}/messages`;
    const payload = {
      model,
      max_tokens: 1024,
      temperature: 0,
      system: sys,
      messages: [{ role: 'user', content: user }],
    };
    if (structured) {
      // 强制工具调用拿结构化输出
      payload.tools = [{ name: 'infer_prop', description: '输出属性推断结果', input_schema: PROP_SCHEMA }];
      payload.tool_choice = { type: 'tool', name: 'infer_prop' };
    }
    return {
      url,
      headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      payload,
    };
  }

  if (protocol === 'gemini') {
    const root = cfg.baseURL.replace(/\/+$/, '');
    const url = `${root}/models/${encodeURIComponent(model)}:generateContent`;
    const payload = {
      contents: [{ role: 'user', parts: [{ text: `${sys}\n\n${user}` }] }],
      generationConfig: { temperature: 0 },
    };
    if (structured) {
      payload.generationConfig.responseMimeType = 'application/json';
      payload.generationConfig.responseSchema = geminiSchema();
    }
    return { url, headers: { 'x-goog-api-key': cfg.apiKey }, payload };
  }

  // openai 兼容（默认）
  return {
    url: chatCompletionsURL(cfg.baseURL),
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    payload: body,
  };
}

/** gemini 的 responseSchema 不支持联合类型，转成宽松 schema */
function geminiSchema() {
  return {
    type: 'object',
    properties: {
      type: { type: 'string' },
      options: { type: 'array', items: { type: 'string' } },
      icon: { type: 'string' },
      defaultValue: { type: 'string' },
    },
    required: ['type'],
  };
}

/** 从各协议响应里抽出文本内容 */
function extractProtocolContent(data, protocol) {
  if (protocol === 'anthropic') {
    // 工具调用优先（tool_use.input 即结构化结果），否则取文本
    const tu = data?.content?.find((c) => c?.type === 'tool_use');
    if (tu?.input) return JSON.stringify(tu.input);
    const text = data?.content?.filter((c) => c?.type === 'text').map((c) => c.text).join('');
    return text || '';
  }
  if (protocol === 'gemini') {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) return parts.map((p) => p?.text ?? '').join('');
    return '';
  }
  return data?.choices?.[0]?.message?.content;
}

/* ── 结构化输出降级链 ───────────────────────────────────── */

function buildBody(cfg, name, responseFormat) {
  const body = {
    model: cfg.model,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `属性名：${name}` },
    ],
  };
  if (responseFormat === 'json_schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'prop', strict: true, schema: PROP_SCHEMA },
    };
  } else if (responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
    // DeepSeek/Qwen 的 json_object 要求 prompt 中带 "json"
    body.messages[0].content += ' 必须输出合法 JSON。';
  } else if (responseFormat === 'tool_choice' || responseFormat === 'responseSchema') {
    // anthropic / gemini 的结构化标记（具体请求体在 buildRequest 里按协议构造）
    body.response_format = { type: responseFormat };
  }
  return body;
}

/**
 * 三级降级链：json_schema → json_object → prompt-only（extractJson + normalize）。
 * @returns {Promise<{source:'llm', def:object, model:string}|{source:'fallback', error?:string}>}
 */
export async function inferProp(cfg, name, { fetchImpl = globalThis.fetch, log = {} } = {}) {
  if (!isConfigured(cfg)) return { source: 'fallback', error: 'not_configured' };
  const protocol = resolveProtocol(cfg.provider);
  const promptOnly = (c) => {
    const raw = extractJson(c);
    if (!raw) throw new Error('no json in prompt-only reply');
    return JSON.parse(raw);
  };
  // 各协议的降级链：
  //  openai   : json_schema → json_object → prompt-only
  //  anthropic: tool_choice（强制工具）→ prompt-only
  //  gemini   : responseSchema → prompt-only
  let attempts;
  if (protocol === 'anthropic') {
    attempts = [
      ['tool_choice', () => buildBody(cfg, name, 'tool_choice'), (c) => JSON.parse(c)],
      ['prompt_only', () => buildBody(cfg, name, null), promptOnly],
    ];
  } else if (protocol === 'gemini') {
    attempts = [
      ['responseSchema', () => buildBody(cfg, name, 'responseSchema'), (c) => JSON.parse(c)],
      ['prompt_only', () => buildBody(cfg, name, null), promptOnly],
    ];
  } else {
    attempts = [
      ['json_schema', () => buildBody(cfg, name, 'json_schema'), (c) => JSON.parse(c)],
      ['json_object', () => buildBody(cfg, name, 'json_object'), (c) => JSON.parse(c)],
      ['prompt_only', () => buildBody(cfg, name, null), promptOnly],
    ];
  }
  let lastError = '';
  for (const [label, build, parse] of attempts) {
    try {
      const { ok, content, status, error } = await chatCompletions(cfg, build(label), fetchImpl);
      if (!ok) {
        lastError = error || (status ? `http_${status}` : '');
        log?.debug?.(`infer attempt ${label} failed: ${lastError}`);
        continue;
      }
      const def = normalizePropDef(parse(content));
      if (!def) {
        lastError = 'invalid_shape';
        log?.debug?.(`infer attempt ${label} produced invalid shape`);
        continue;
      }
      return { source: 'llm', def, model: cfg.model };
    } catch (e) {
      lastError = 'parse_error';
      log?.debug?.(`infer attempt ${label} parse error: ${e?.message ?? e}`);
    }
  }
  log?.warn?.(`inferProp all attempts failed (${lastError}) — falling back to local`);
  return { source: 'fallback', error: lastError };
}
