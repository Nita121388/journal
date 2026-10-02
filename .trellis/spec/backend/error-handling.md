# Error Handling (Backend)

> How the Node host catches, logs, and returns errors.

---

## Overview

The host is a **local-only** process serving one client (the extension). Error handling favors **explicit, structured JSON responses** to the extension plus **clear stderr logging** — no crash, no silent failure.

---

## Error Types

| Type | When | HTTP/Response | Log |
|------|------|--------------|-----|
| `VALIDATION_ERROR` | Bad request body (missing `dayKey`, bad todo shape) | `400` + `{ error: { code, message } }` | `warn` |
| `NOT_FOUND` | Asked to update/delete a non-existent journal/todo | `404` + `{ error: { code } }` | `warn` |
| `AI_ERROR` | LLM call failed (timeout, API key rejected) | **`200` + `{ ok:true, data:{ source:'fallback', ...localResult } }`**（AI 增强类端点采用静默降级：LLM 故障/未配置时返回本地结果，扩展无需区分「网络错」与「没配 key」，见 `lib/llm.js`） | `warn` |
| 配置缺失 | AI key/baseURL/model 未填或 disabled | `200` + `data.source:'not_configured'`（同一端点） | `warn` |
| `STORAGE_ERROR` | JSON file read/write failed, disk full | `500` + `{ error: { code } }` | `error` |
| `INTERNAL` | Anything unexpected | `500` + `{ error: { code: 'INTERNAL' } }` | `error` + stack |

---

## Response Contract

All responses are JSON. Success:

```json
{ "ok": true, "data": { ... } }
```

Failure:

```json
{ "ok": true, "data": { "source": "fallback", "type": "text", "icon": "📄", "options": null } }
```

> 例外：**AI 增强类端点（`/api/ai/*`）不返回 502**。LLM 故障、超时、未配置统一为 `200 + data.source: 'fallback' | 'not_configured'`（静默降级到本地结果），保证扩展 UI 永不因 AI 故障中断。AI 相关错误细节只在服务端日志（warn，不含 key/prompt）。

- **Never leak stack traces or file paths** in the response `message` (host is local, but keep it clean). Full detail goes to stderr.
- The extension's `lib/ai.js` maps `error.code` to a friendly UI message.

---

## Async Handling

Wrap every async route handler so an unhandled rejection never crashes the process:

```js
function asyncHandler(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('[host] unhandled:', err);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Unexpected error' } });
    });
  };
}
```

- Attach `process.on('uncaughtException')` and `'unhandledRejection'` in `index.js`: log, keep serving (the host should stay alive; a restart loop is worse than a degraded response).

---

## Retry Policy

- **AI calls**: retry once on transient errors (timeout, 429/5xx), with backoff `500ms`. Do not retry on `400` (bad request) or `401/403` (auth).
- **Storage writes**: no auto-retry — surface `STORAGE_ERROR` immediately (retrying a corrupt file write hides real disk issues).

---

## Common Mistakes

- Letting an AI-call rejection escape the route → process crash, extension shows "host disconnected".
- Returning raw stack traces to the extension → confusing UI errors.
- Swallowing errors with empty `catch {}` → silent data loss on journal writes.
