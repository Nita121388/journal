/**
 * server-security.test.mjs — host 本地 API 的来源限制与写入护栏
 *
 * 威胁模型：host 监听 127.0.0.1，**任意网页**都能向 localhost 发请求。
 * 若不做来源校验，任何网站即可跨源读写用户全部日志，并可通过
 * 「改写 AI baseURL → 诱导 host 用用户真 key 请求攻击者服务器」窃取密钥。
 *
 * 运行：node --test host/test/server-security.test.mjs
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';

const dir = mkdtempSync(join(tmpdir(), 'jsec-'));
const dataDir = join(dir, 'data');
mkdirSync(dataDir, { recursive: true });
// 必须在 import server.js **之前**设好：模块级 CONFIG_PATH 在导入时即解析。
const cfgPath = join(dataDir, 'config.json');
process.env.JOURNAL_AI_CONFIG = cfgPath;
// 扩展 ID 白名单：正式安装由 install-host.bat 写入 host/extension-ids.txt；
// 测试用环境变量固定一个已知 ID，同时验证「不在白名单的扩展被拒」。
const ALLOWED_EXT = 'abcdefghijklmnop';
process.env.JOURNAL_ALLOWED_EXTENSION_IDS = ALLOWED_EXT;
const { startServer } = await import('../server.js');

const { server, store, url } = await startServer({
  port: 0, dataDir, logger: { debug() {}, info() {}, warn() {}, error() {} },
});

after(async () => {
  await new Promise(r => server.close(r));
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** 带自定义 Origin 的请求（模拟浏览器跨源调用）。 */
async function req(method, path, { origin, body } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, cors: res.headers.get('access-control-allow-origin'), json: await res.json().catch(() => null) };
}

test('网页来源被拒：https://evil.example 读写均 403 且不下发 CORS 头', async () => {
  const read = await req('GET', '/api/cards', { origin: 'https://evil.example' });
  assert.equal(read.status, 403);
  assert.equal(read.json.error.code, 'FORBIDDEN_ORIGIN');
  assert.equal(read.cors, null, '被拒来源不得回显 Access-Control-Allow-Origin');

  const write = await req('POST', '/api/cards', { origin: 'https://evil.example', body: { content: 'x' } });
  assert.equal(write.status, 403);
});

test('沙箱来源 Origin: null 被拒', async () => {
  const r = await req('GET', '/api/cards', { origin: 'null' });
  assert.equal(r.status, 403);
});

test('扩展页面来源放行并回显 Origin', async () => {
  const r = await req('GET', '/api/cards', { origin: `chrome-extension://${ALLOWED_EXT}` });
  assert.equal(r.status, 200);
  assert.equal(r.cors, `chrome-extension://${ALLOWED_EXT}`);
});

test('不在白名单的扩展来源被拒（安全 P2-5：任意扩展不得读全库）', async () => {
  const r = await req('GET', '/api/cards', { origin: 'chrome-extension://someotherextensionid' });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'FORBIDDEN_ORIGIN');
  assert.equal(r.cors, null);
});

test('本机回环来源放行（web 实现 / dev-loop）', async () => {
  const r = await req('GET', '/api/cards', { origin: 'http://localhost:5500' });
  assert.equal(r.status, 200);
  assert.equal(r.cors, 'http://localhost:5500');
});

test('无 Origin（CLI / agent / curl）放行且不下发 CORS 头', async () => {
  const r = await req('GET', '/api/cards');
  assert.equal(r.status, 200);
  assert.equal(r.cors, null);
});

test('OPTIONS 预检来自网页 → 403', async () => {
  const r = await req('OPTIONS', '/api/cards', { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('OPTIONS 预检来自扩展 → 204 且回显 Origin', async () => {
  const r = await req('OPTIONS', '/api/cards', { origin: `chrome-extension://${ALLOWED_EXT}` });
  assert.equal(r.status, 204);
  assert.equal(r.cors, `chrome-extension://${ALLOWED_EXT}`);
});

test('请求体超过 8MB → 413（用裸 socket 取证：服务端确实回了状态码）', async () => {
  const u = new URL(url);
  const body = JSON.stringify({ content: 'x'.repeat(9 * 1024 * 1024) });
  const status = await new Promise((resolve, reject) => {
    const sock = connect(Number(u.port), u.hostname, () => {
      sock.write(
        `POST /api/cards HTTP/1.1\r\nHost: ${u.host}\r\n` +
        `Origin: chrome-extension://${ALLOWED_EXT}\r\n` +
        'Content-Type: application/json\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n` + body,
      );
    });
    let buf = '';
    const settle = () => {
      const m = buf.match(/^HTTP\/1\.1 (\d{3})/);
      if (m) { sock.destroy(); resolve(Number(m[1])); return true; }
      return false;
    };
    sock.on('data', (d) => { buf += d.toString(); settle(); });
    sock.on('error', () => { if (!settle()) resolve(-1); });
    sock.on('close', () => { if (!settle()) resolve(-1); });
    setTimeout(() => { sock.destroy(); if (!settle()) reject(new Error('timeout')); }, 8000);
  });
  assert.equal(status, 413);
});

test('AI 配置：改 baseURL 但不重交 Key → 400（防密钥被发往新端点）', async () => {
  writeFileSync(cfgPath, JSON.stringify({ provider: 'openai', baseURL: 'https://api.openai.com', model: 'gpt-4', apiKey: 'sk-secret' }), 'utf-8');

  const blocked = await req('PUT', '/api/ai/config', {
    origin: `chrome-extension://${ALLOWED_EXT}`,
    body: { baseURL: 'https://evil.example/v1' },
  });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.json.error.code, 'AI_ENDPOINT_CHANGE_REQUIRES_KEY');

  // 同时提交新 key 则放行
  const allowed = await req('PUT', '/api/ai/config', {
    origin: `chrome-extension://${ALLOWED_EXT}`,
    body: { baseURL: 'https://evil.example/v1', apiKey: 'sk-new' },
  });
  assert.equal(allowed.status, 200);

  // 仅改 model（端点不变）不需要重交 key
  const modelOnly = await req('PUT', '/api/ai/config', {
    origin: `chrome-extension://${ALLOWED_EXT}`,
    body: { model: 'gpt-4o' },
  });
  assert.equal(modelOnly.status, 200);
  assert.ok(!JSON.stringify(modelOnly.json).includes('sk-'), '响应不得回显密钥');
});

test('密钥永不回显', async () => {
  writeFileSync(cfgPath, JSON.stringify({ provider: 'openai', baseURL: 'https://x', model: 'm', apiKey: 'sk-verysecret' }), 'utf-8');
  const r = await req('GET', '/api/ai/config', { origin: `chrome-extension://${ALLOWED_EXT}` });
  assert.equal(JSON.stringify(r.json).includes('sk-verysecret'), false);
  assert.ok(readFileSync(cfgPath, 'utf-8').length > 0);
});
