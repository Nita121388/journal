/**
 * llm.test.mjs — host LLM 代理层单测（纯函数，不联网）
 * 运行：node --test host/test/llm.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readConfig, isConfigured, chatCompletionsURL, extractJson,
  normalizePropDef, inferProp, PROP_TYPES,
} from '../lib/llm.js';

const log = { debug(){}, warn(){} };

test('readConfig：无文件 → null', () => {
  assert.equal(readConfig('/nonexistent/definitely-missing.json'), null);
});

test('readConfig：apiKey 为空 → null；填全 → 配置对象', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jllm-'));
  const p = join(dir, 'config.json');
  try {
    writeFileSync(p, JSON.stringify({ baseURL: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: '' }));
    assert.equal(readConfig(p), null);
    writeFileSync(p, JSON.stringify({ baseURL: 'https://api.deepseek.com/', model: 'deepseek-chat', apiKey: 'sk-123' }));
    const cfg = readConfig(p);
    assert.ok(cfg);
    assert.equal(cfg.baseURL, 'https://api.deepseek.com');
    assert.equal(cfg.apiKey, 'sk-123');
    assert.ok(isConfigured(cfg));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readConfig：非法 JSON → null（不 crash）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jllm-'));
  const p = join(dir, 'config.json');
  try {
    writeFileSync(p, '{ broken');
    assert.equal(readConfig(p), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('chatCompletionsURL：兼容 /v1 与裸根', () => {
  assert.equal(chatCompletionsURL('https://api.deepseek.com'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(chatCompletionsURL('https://api.deepseek.com/v1'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(chatCompletionsURL('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(chatCompletionsURL('http://127.0.0.1:11434/v1'), 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(chatCompletionsURL('https://x.com/chat/completions'), 'https://x.com/chat/completions');
});

test('extractJson：裸 JSON / 围栏 / 前后散文', () => {
  assert.equal(extractJson('{"a":1}'), '{"a":1}');
  assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJson('结果如下：{"a":{"b":2}} 完。'), '{"a":{"b":2}}');
  assert.equal(extractJson('无 json'), null);
  assert.equal(extractJson('{"a":"含}花括号"}'), '{"a":"含}花括号"}');
});

test('normalizePropDef：校验修复', () => {
  assert.deepEqual(normalizePropDef({ type: 'select', options: ['高', ' 中 ', '低'], icon: '⭐️' }),
    { type: 'select', options: ['高', '中', '低'], icon: '⭐️', defaultValue: '' });
  assert.deepEqual(normalizePropDef({ type: 'number', options: ['x'], icon: '🔢' }),
    { type: 'number', options: null, icon: '🔢', defaultValue: '' });
  assert.deepEqual(normalizePropDef({ type: 'checkbox', options: null, icon: '☑️' }),
    { type: 'checkbox', options: null, icon: '☑️', defaultValue: false });
  assert.equal(normalizePropDef({ type: 'bogus' }), null);
  assert.equal(normalizePropDef(null), null);
  assert.deepEqual(normalizePropDef({ type: 'multi', options: ['a', 'b'], icon: 'x' }),
    { type: 'multi', options: ['a', 'b'], icon: 'x', defaultValue: '' });
});

test('inferProp：未配置 → fallback/not_configured（不发请求）', async () => {
  let calls = 0;
  const r = await inferProp(null, '客户满意度', { fetchImpl: async () => { calls++; throw new Error('should not call'); }, log });
  assert.equal(r.source, 'fallback');
  assert.equal(r.error, 'not_configured');
  assert.equal(calls, 0);
});

test('inferProp：json_schema 成功 → source=llm', async () => {
  const cfg = { enabled: true, baseURL: 'https://mock', model: 'm', apiKey: 'k', timeoutMs: 500 };
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.response_format.type, 'json_schema');
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ type: 'number', options: null, icon: '🔢' }) } }] }) };
  };
  const r = await inferProp(cfg, '客户满意度评分', { fetchImpl, log });
  assert.equal(r.source, 'llm');
  assert.equal(r.def.type, 'number');
  assert.equal(r.def.icon, '🔢');
});

test('inferProp：json_schema 报错 → 降级 json_object → 成功', async () => {
  const cfg = { enabled: true, baseURL: 'https://mock', model: 'm', apiKey: 'k', timeoutMs: 500 };
  let n = 0;
  const fetchImpl = async (url, opts) => {
    n++;
    const body = JSON.parse(opts.body);
    if (n === 1) return { ok: false, status: 400, json: async () => ({}) }; // json_schema 不支持
    assert.equal(body.response_format.type, 'json_object');
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ type: 'select', options: ['高', '中', '低'], icon: '⭐️' }) } }] }) };
  };
  const r = await inferProp(cfg, '重要程度', { fetchImpl, log });
  assert.equal(r.source, 'llm');
  assert.equal(r.def.type, 'select');
  assert.equal(r.def.options.join(','), '高,中,低');
  assert.equal(n, 2);
});

test('inferProp：全部失败 → fallback（超时/坏JSON/围栏）', async () => {
  const cfg = { enabled: true, baseURL: 'https://mock', model: 'm', apiKey: 'k', timeoutMs: 500 };
  const fetchImpl = async () => {
    throw new Error('simulated network failure');
  };
  const r = await inferProp(cfg, '随便什么名字', { fetchImpl, log });
  assert.equal(r.source, 'fallback');
  assert.ok(r.error);
});

test('inferProp：围栏输出在 prompt_only 级被解析', async () => {
  const cfg = { enabled: true, baseURL: 'https://mock', model: 'm', apiKey: 'k', timeoutMs: 500 };
  let n = 0;
  const fetchImpl = async (url, opts) => {
    n++;
    const body = JSON.parse(opts.body);
    if (n <= 2) return { ok: false, status: 500, json: async () => ({}) };
    // prompt_only：无 response_format，返回围栏包着的 JSON
    assert.equal(body.response_format, undefined);
    return { ok: true, json: async () => ({ choices: [{ message: { content: '```json\n{"type":"date","options":null,"icon":"🗓️"}\n```' } }] }) };
  };
  const r = await inferProp(cfg, '截止日期', { fetchImpl, log });
  assert.equal(r.source, 'llm');
  assert.equal(r.def.type, 'date');
  assert.equal(n, 3);
});

test('PROP_TYPES 枚举完整性（与扩展对齐）', () => {
  assert.deepEqual(PROP_TYPES, ['text', 'textarea', 'number', 'select', 'multi', 'date', 'time', 'checkbox', 'schedule', 'tags', 'status']);
});

/* ── 协议分派（对齐参考项目：24 家服务商 / 三协议） ─────── */

test('resolveProtocol：minimax→anthropic、google/vertexai→gemini、其余 openai', async () => {
  const { resolveProtocol } = await import('../lib/llm-providers.js');
  assert.equal(resolveProtocol('minimax'), 'anthropic');
  assert.equal(resolveProtocol('anthropic'), 'anthropic');
  assert.equal(resolveProtocol('google'), 'gemini');
  assert.equal(resolveProtocol('vertexai'), 'gemini');
  assert.equal(resolveProtocol('deepseek'), 'openai');
  assert.equal(resolveProtocol('qwen'), 'openai');
  assert.equal(resolveProtocol('glm'), 'openai');
  assert.equal(resolveProtocol(''), 'openai');
});

test('PROVIDER_INFO 24 家 + ollama 本地地址 + FIXED_CRED 3 家', async () => {
  const { PROVIDER_INFO, FIXED_CRED_PROVIDERS, SUGGESTED_MODELS } = await import('../lib/llm-providers.js');
  assert.equal(Object.keys(PROVIDER_INFO).length, 24, '24 家服务商');
  assert.equal(PROVIDER_INFO.ollama.defaultBaseUrl, 'http://127.0.0.1:11434/v1', 'ollama 本地地址');
  assert.equal(PROVIDER_INFO.deepseek.defaultBaseUrl, 'https://api.deepseek.com/v1');
  assert.deepEqual(FIXED_CRED_PROVIDERS, ['bedrock', 'vertexai', 'ollama']);
  assert.ok(Array.isArray(SUGGESTED_MODELS.deepseek) && SUGGESTED_MODELS.deepseek.length > 0, 'deepseek 有推荐模型');
});

test('isConfigured：无需 key 的服务商（ollama）不要求 apiKey', async () => {
  const { isConfigured } = await import('../lib/llm.js');
  const ollama = { enabled: true, provider: 'ollama', baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:3b', apiKey: '' };
  assert.equal(isConfigured(ollama), true, 'ollama 无 key 也算已配置');
  const deepseek = { enabled: true, provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: '' };
  assert.equal(isConfigured(deepseek), false, 'deepseek 无 key → 未配置');
});

test('anthropic 协议（minimax）：请求 /messages + x-api-key + anthropic-version + tool_choice', async () => {
  const { inferProp } = await import('../lib/llm.js');
  const cfg = { enabled: true, provider: 'minimax', baseURL: 'https://api.minimaxi.com/anthropic', model: 'MiniMax-M3', apiKey: 'sk-ant', timeoutMs: 500 };
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, headers: opts.headers, body: JSON.parse(opts.body) };
    return { ok: true, json: async () => ({ content: [{ type: 'tool_use', input: { type: 'select', options: ['高', '中'], icon: '⭐️' } }] }) };
  };
  const r = await inferProp(cfg, '重要度', { fetchImpl, log });
  assert.equal(r.source, 'llm');
  assert.equal(r.def.type, 'select');
  assert.ok(seen.url.endsWith('/messages'), `anthropic url 应以 /messages 结尾，实际 ${seen.url}`);
  assert.equal(seen.headers['x-api-key'], 'sk-ant');
  assert.ok(seen.headers['anthropic-version'], 'anthropic-version header 缺失');
  assert.ok(seen.body.tools && seen.body.tool_choice, 'anthropic 应带 tools/tool_choice');
});

test('gemini 协议（google）：请求 :generateContent + x-goog-api-key + responseSchema', async () => {
  const { inferProp } = await import('../lib/llm.js');
  const cfg = { enabled: true, provider: 'google', baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.1-pro', apiKey: 'gk', timeoutMs: 500 };
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, headers: opts.headers, body: JSON.parse(opts.body) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ type: 'number', options: null, icon: '🔢' }) }] } }] }) };
  };
  const r = await inferProp(cfg, '评分', { fetchImpl, log });
  assert.equal(r.source, 'llm');
  assert.equal(r.def.type, 'number');
  assert.ok(seen.url.includes(':generateContent'), `gemini url 应含 :generateContent，实际 ${seen.url}`);
  assert.equal(seen.headers['x-goog-api-key'], 'gk');
  assert.equal(seen.body.generationConfig.responseMimeType, 'application/json');
  assert.ok(seen.body.generationConfig.responseSchema, 'gemini 应带 responseSchema');
});

test('openai 协议（deepseek）：请求 /chat/completions + Bearer + response_format json_schema', async () => {
  const { inferProp } = await import('../lib/llm.js');
  const cfg = { enabled: true, provider: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'sk-ds', timeoutMs: 500 };
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, headers: opts.headers, body: JSON.parse(opts.body) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ type: 'date', options: null, icon: '🗓️' }) } }] }) };
  };
  const r = await inferProp(cfg, '截止日期', { fetchImpl, log });
  assert.equal(r.source, 'llm');
  assert.ok(seen.url.endsWith('/chat/completions'));
  assert.equal(seen.headers.Authorization, 'Bearer sk-ds');
  assert.equal(seen.body.response_format.type, 'json_schema');
});

test('readConfig：no-key 服务商（ollama）允许空 apiKey', async () => {
  const { readConfig } = await import('../lib/llm.js');
  const dir = mkdtempSync(join(tmpdir(), 'jllm-'));
  const p = join(dir, 'config.json');
  try {
    writeFileSync(p, JSON.stringify({ provider: 'ollama', baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:3b', apiKey: '' }));
    const cfg = readConfig(p);
    assert.ok(cfg, 'ollama 无 key 应读取成功');
    assert.equal(cfg.apiKey, '');
    assert.equal(isConfigured(cfg), true, 'ollama 无 key 已配置');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
