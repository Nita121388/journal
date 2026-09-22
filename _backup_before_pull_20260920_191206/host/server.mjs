#!/usr/bin/env node
/* ================================================================
   Journal host — server.mjs
   一个进程，两个角色：
   1. WS server（ws://127.0.0.1:<port>）——与扩展 service worker 双向 RPC
   2. MCP server（stdio）——本机 agent（Claude/Pi Agent 等）经此操作扩展

   Token：与扩展设置里的一致。
     · 优先读 JOURNAL_TOKEN 环境变量
     · 其次读 ~/journal/config.json 的 { "token": "...", "port": 23517 }
     · 都没有则随机生成并写回 config.json（把里面的 token 填到扩展设置里）
   ================================================================ */

import { WebSocketServer } from 'ws';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildTools } from './tools.mjs';

const DATA_DIR = join(homedir(), 'journal');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

/* ─── 配置 / token ───────────────────────────────────────────── */

let config = { token: '', port: 23517 };
if (process.env.JOURNAL_TOKEN) config.token = process.env.JOURNAL_TOKEN;
if (process.env.JOURNAL_PORT) config.port = Number(process.env.JOURNAL_PORT);
if (!config.token && existsSync(CONFIG_FILE)) {
  try { config = { ...config, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) }; } catch { /* rewrite below */ }
}
if (!config.token) {
  config.token = randomBytes(16).toString('hex');
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.error(`[journal-host] 生成新 token，已写入 ${CONFIG_FILE}`);
  console.error(`[journal-host] token: ${config.token}`);
  console.error('[journal-host] 请把此 token 填到扩展 设置 → 本机 Agent');
}

const PORT = config.port;

/* ─── 扩展连接管理 ───────────────────────────────────────────── */

let extSocket = null;
let nextId = 1;
const pending = new Map();

function isAuthed(ws) {
  return !!ws && ws.readyState === 1 && ws === extSocket;
}

/** 向扩展发 RPC 请求（host → extension） */
function extRequest(method, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!isAuthed(extSocket)) return reject(new Error('extension not connected'));
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`ext RPC timeout: ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    extSocket.send(JSON.stringify({ type: 'req', id, method, params }));
  });
}

/* ─── MCP 工具 ───────────────────────────────────────────────── */

const connectedTools = buildTools({
  call: (method, params) => extRequest(method, params),
  isConnected: () => isAuthed(extSocket),
});

function startMcp() {
  const server = new McpServer({ name: 'journal-host', version: '0.1.0' });
  for (const tool of connectedTools) {
    server.tool(tool.name, tool.description, tool.schema.shape, async (args) => {
      try {
        if (tool.requireExtension === false || isAuthed(extSocket)) {
          const result = await tool.run(args);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'extension not connected: 请先打开 Journal 扩展' }) }],
          isError: true,
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(e?.message || e) }) }],
          isError: true,
        };
      }
    });
  }
  const transport = new StdioServerTransport();
  server.connect(transport).catch(e => console.error('[journal-host] MCP connect failed', e));
}

/* ─── WS server ──────────────────────────────────────────────── */

function startServer() {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });

  wss.on('connection', (ws) => {
    let authed = false;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'hello') {
        if (msg.token !== config.token) {
          ws.send(JSON.stringify({ type: 'hello_res', ok: false, error: 'bad token' }));
          ws.close();
          return;
        }
        authed = true;
        if (msg.client === 'cli') {
          ws.isCli = true;
          console.error('[journal-host] cli connected');
        } else {
          extSocket = ws;
          console.error('[journal-host] extension connected');
        }
        ws.send(JSON.stringify({ type: 'hello_res', ok: true }));
        return;
      }
      if (!authed) return;

      if (msg.type === 'req') {
        // 扩展只响应 host 的 RPC（数据都在扩展本地，host 不执行任何业务逻辑）
        const respond = (p) => ws.send(JSON.stringify({ type: 'res', id: msg.id, ...p }));
        extRequest(msg.method, msg.params).then(
          result => respond({ result }),
          error => respond({ error: String(error?.message || error) })
        );
        return;
      }

      if (msg.type === 'res' && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.result);
      }
    });

    ws.on('close', () => {
      if (extSocket === ws) {
        extSocket = null;
        console.error('[journal-host] extension disconnected');
      }
    });
  });

  console.error(`[journal-host] WS server 127.0.0.1:${PORT}`);
  console.error('[journal-host] MCP stdio ready — 接入方式：node <本目录>/server.mjs (stdio)');
}

startMcp();
startServer();