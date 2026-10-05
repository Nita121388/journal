/**
 * ai.test.mjs — /api/ai/* 端点集成测试（临时数据目录 + 本地 mock LLM，不联网）
 * 运行：node --test host/test/ai.test.mjs
 *
 * 覆盖：
 *  1. 未配置 → source=not_configured，且回落请求里的 local 结果
 *  2. 已配置 → host 转发到 mock LLM，返回 source=llm（json_schema 链路）
 *  3. GET /api/ai/config 永不返回 apiKey
 *  4. LLM 挂掉（500）→ source=fallback，仍 200 不报错
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 必须在 import server.js 之前设 JOURNAL_AI_CONFIG（CONFIG_PATH 在 import 时求值）
const tmp = mkdtempSync(join(tmpdir(), 'jai-'));
const dataDir = join(tmp, 'data');
const missingConfig = join(tmp, 'missing-config.json');
process.env.JOURNAL_AI_CONFIG = missingConfig;
rmSync(join(dataDir, 'config.json'), { force: true });

const { startServer } = await import('../server.js');
const log = { debug() {}, info() {}, warn() {}, error() {} };

let host, hostStore, hostUrl;
let llm, llmPort = 0, llmHits = 0, llmHandler = null;

async function api(method, path, body) {
  const res = await fetch(hostUrl + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

before(async () => {
  // mock OpenAI 端点
  llm = createHttpServer((req, res) => {
    llmHits++;
    llmHandler(req, res);
  });
  await new Promise((r) => llm.listen(0, '127.0.0.1', r));
  llmPort = llm.address().port;
  ({ server: host, store: hostStore, url: hostUrl } = await startServer({ port: 0, dataDir, logger: log }));
});

after(async () => {
  await new Promise((r) => host.close(r));
  await new Promise((r) => llm.close(r));
  await hostStore.close();
  rmSync(tmp, { recursive: true, force: true });
});

function writeConfig(overrides = {}) {
  // CONFIG_PATH 在 import 时已固定为 missingConfig；直接覆写该文件内容
  writeFileSync(missingConfig, JSON.stringify({
    provider: 'mock',
    baseURL: `http://127.0.0.1:${llmPort}/v1`,
    model: 'mock-model',
    apiKey: 'sk-test-SECRET-KEY',
    timeoutMs: 3000,
    enabled: true,
    ...overrides,
  }));
}

test('未配置：GET config configured=false 且无 apiKey；POST 返回 not_configured + 本地结果', async () => {
  rmSync(missingConfig, { force: true });
  const c = await api('GET', '/api/ai/config');
  assert.equal(c.status, 200);
  assert.equal(c.json.data.configured, false);
  assert.ok(!JSON.stringify(c.json).includes('SECRET'), 'config 响应不得含 key');
  const beforeHits = llmHits;
  const r = await api('POST', '/api/ai/infer-prop', { name: '客户满意度评分', local: { icon: '📄', type: 'text', options: null } });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.source, 'not_configured');
  assert.equal(r.json.data.type, 'text');
  assert.equal(r.json.data.icon, '📄');
  assert.equal(llmHits, beforeHits, '未配置不得发 LLM 请求');
});

test('已配置：json_schema 链路 → source=llm；config 仍不含 key', async () => {
  writeConfig();
  llmHandler = (req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
      const body = JSON.parse(b);
      assert.equal(body.model, 'mock-model');
      assert.equal(body.response_format?.type, 'json_schema');
      assert.ok(req.headers.authorization === 'Bearer sk-test-SECRET-KEY', '转发须带 Authorization');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ type: 'select', options: ['满意', '一般', '不满意'], icon: '💬' }) } }] }));
    });
  };
  const c = await api('GET', '/api/ai/config');
  assert.equal(c.json.data.configured, true);
  assert.ok(!JSON.stringify(c.json).includes('SECRET'), '已配置 config 响应也不得含 key');
  const r = await api('POST', '/api/ai/infer-prop', { name: '客户满意度', local: { icon: '📄', type: 'text', options: null } });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.source, 'llm');
  assert.equal(r.json.data.type, 'select');
  assert.equal(r.json.data.options.join(','), '满意,一般,不满意');
  assert.equal(r.json.data.icon, '💬');
});

test('LLM 挂掉（500）→ 200 + source=fallback + 本地结果（静默降级）', async () => {
  writeConfig();
  llmHandler = (req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'server exploded' }));
  };
  const before = llmHits;
  const r = await api('POST', '/api/ai/infer-prop', { name: '血标本采集时限', local: { icon: '📄', type: 'text', options: null } });
  assert.equal(r.status, 200, 'LLM 失败仍返回 200');
  assert.equal(r.json.data.source, 'fallback');
  assert.equal(r.json.data.type, 'text');
  assert.equal(r.json.data.icon, '📄');
  assert.ok(llmHits > before, '确实尝试过调 LLM');
});

test('缺 name → 400 VALIDATION_ERROR', async () => {
  const r = await api('POST', '/api/ai/infer-prop', {});
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'VALIDATION_ERROR');
});

test('PUT /api/ai/config：写入后 GET configured=true 且 key 永不回显', async () => {
  // 先清掉配置
  rmSync(missingConfig, { force: true });
  const put = await api('PUT', '/api/ai/config', {
    provider: 'deepseek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: 'sk-PUT-SECRET',
    enabled: true,
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.data.configured, true);
  assert.ok(!JSON.stringify(put.json).includes('SECRET'), 'PUT 响应不得含 key');
  const get = await api('GET', '/api/ai/config');
  assert.equal(get.json.data.configured, true);
  assert.equal(get.json.data.provider, 'deepseek');
  assert.equal(get.json.data.model, 'deepseek-chat');
  assert.equal(get.json.data.baseURL, 'https://api.deepseek.com');
  assert.ok(!JSON.stringify(get.json).includes('SECRET'), 'GET 响应不得含 key');
});

test('PUT /api/ai/config：省略 apiKey 不改已有 key', async () => {
  // 已有 key sk-PUT-SECRET；只改 model
  const put = await api('PUT', '/api/ai/config', { model: 'qwen-plus' });
  assert.equal(put.status, 200);
  assert.ok(!JSON.stringify(put.json).includes('SECRET'));
  const get = await api('GET', '/api/ai/config');
  assert.equal(get.json.data.model, 'qwen-plus');
  assert.equal(get.json.data.configured, true, '省略 key 不改 key → 仍 configured');
  // 验证真实文件里 key 还在
  const { readFileSync } = await import('node:fs');
  const raw = JSON.parse(readFileSync(missingConfig, 'utf-8'));
  assert.equal(raw.apiKey, 'sk-PUT-SECRET');
});

test('GET /api/ai/providers：返回 24 家 + 推荐模型 + no-key 列表 + logo', async () => {
  const r = await api('GET', '/api/ai/providers');
  assert.equal(r.status, 200);
  const d = r.json.data;
  assert.equal(Object.keys(d.providerInfo).length, 24, '24 家服务商');
  assert.ok(Array.isArray(d.suggestedModels.deepseek) && d.suggestedModels.deepseek.length > 0, 'deepseek 推荐模型');
  assert.deepEqual(d.fixedCredProviders, ['bedrock', 'vertexai', 'ollama']);
  assert.ok(d.logoMap.deepseek, 'logo 映射存在');
  assert.equal(d.providerInfo.ollama.defaultBaseUrl, 'http://127.0.0.1:11434/v1', 'ollama 本地地址');
});
