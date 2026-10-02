# Directory Structure (Backend)

> How the Node.js local host code is organized.

---

## Overview

The **backend** of Journal is the `host/` directory: a **local Node.js process** that provides the AI layer to the extension. It reuses the `tabshelf-host` pattern — a local HTTP/MCP server the extension talks to over `localhost`. There is no remote server; everything runs on the user's machine.

---

## Directory Layout

```
host/
├── package.json          # scripts: start / dev / test
├── server.js             # HTTP server (routes inline) — exports createApp / startServer
├── cli.mjs               # agent/CLI client over the REST API
├── lib/
│   ├── logger.js         # [host][level] component: msg
│   ├── llm.js            # AI 层：config.json 读取 + OpenAI 兼容代理 + 结构化降级链（见 LLM Proxy）
│   └── storage.js        # SQLite store (+ JSON fallback), migration
├── sync/
│   ├── merge.js          # pure LWW + tombstone merge
│   ├── backplane.js      # Memory / LocalFolder / WebDAV / GitHub transports
│   ├── engine.js         # runSync orchestration
│   └── index.js          # barrel export
└── test/                 # node:test suites (*.test.mjs)
```

---

## Module Organization

- **`server.js`** — HTTP layer: parse request → call store/sync → return JSON. Also exports `createApp(store)` and `startServer(opts)` so tests can boot it on an ephemeral port.
- **`lib/storage.js`** — the authoritative store (cards / journals-derived / settings / meta) + legacy migration.
- **`sync/`** — merge engine (pure), pluggable backplanes (transport), and the runSync orchestrator. Keep merge pure and backplanes transport-only.
- **`cli.mjs`** — thin REST client; no business logic.
- Keep the HTTP layer thin; logic lives in `lib/` and `sync/`.

---

## Naming Conventions

| Item | Rule |
|------|------|
| Files | `kebab-case.js` (same as frontend) |
| Routes | plural nouns: `journal.js`, `todo.js` |
| Services | singular nouns: `ai.js`, `intent.js` |
| Exported route handlers | `handle<Action>`: `handleGetToday`, `handleAddEntry` |
| HTTP methods | `GET` read, `POST` write, `DELETE` remove (REST-ish, JSON in/out) |

---

## Examples

- `host/routes/journal.js` — `handleAddEntry(req, res)` → `services/intent.js` parses → `services/ai.js` builds entry → writes via `lib/storage.js`.

## LLM Proxy (`lib/llm.js`)

零依赖（`dependencies: {}`）的 LLM 代理层，供扩展通过 `/api/ai/*` 调用。

- **配置**：`host/data/config.json`（`baseURL` / `model` / `apiKey` / `timeoutMs` / `enabled`）。真实文件被 `.gitignore` 忽略，模板 `config.example.json` 提交。**API key 永不进入响应或日志**。读写经端点 `GET /api/ai/config`（不返回 key）/ `PUT /api/ai/config`（合并写盘，`apiKey` 空串 = 不改）；用户经**选项页 AI 卡片**配置（不再手改文件）；key 只在 PUT body 出现一次，扩展不持久化。`writeConfig` 用 temp→rename 原子写。
- **协议插槽**：`chatCompletions(config, body, fetchImpl)` 是唯一的网络调用点（裸 `fetch`，OpenAI 兼容 `/chat/completions`；国产模型全兼容，只换 `baseURL`）。未来接 Anthropic/Gemini 原生协议或换 Vercel AI SDK 时**只改此函数**，降级链与端点契约不动。
- **结构化输出三级降级链**：`response_format: json_schema` → `json_object` → prompt-only（`extractJson()` 去围栏 + 平衡括号扫描 + `normalizePropDef()` 校验修复）→ `source:'fallback'`。provider 不遵守 `response_format` 时仍能拿到结构化结果。
- **静默降级**：LLM 故障/超时/未配置统一返回 `200 + source:'fallback'|'not_configured'` + 本地结果（见 `error-handling.md`），扩展 UI 永不因 AI 故障中断。
- **可测试**：`fetchImpl` 注入 → `test/llm.test.mjs` + `test/ai.test.mjs` 纯单测/本地 mock，不联网（`quality-guidelines.md` 要求）。
- **触发策略**：扩展侧按本地规则置信度决定是否调 LLM（`auto` / `always` / `never`，见 `extension/lib/prop-llm.js`）——本地规则高置信时不发请求，省成本。
