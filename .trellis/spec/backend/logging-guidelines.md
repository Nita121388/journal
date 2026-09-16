# Logging Guidelines (Backend)

> Structured stderr logging for the Node host.

---

## Overview

The host logs to **stderr** (stdout is reserved for protocol / health output). Logs are human-readable locally (`host/data/host.log` optional) — no remote aggregation.

---

## Log Levels

| Level | When | Example |
|-------|------|---------|
| `debug` | Request/response detail, intent parse trace | `[host][debug] intent: {action:"add",day:"2026-09-08"}` |
| `info` | Lifecycle events (start, stop, health) | `[host][info] listening on 127.0.0.1:8765` |
| `warn` | Recoverable: validation failure, AI retry | `[host][warn] AI call timed out, retrying (1/1)` |
| `error` | Unrecoverable for that request: storage fail, unhandled | `[host][error] STORAGE_ERROR: write failed: ENOSPC` |

---

## Format

Single-line prefix convention:

```
[host][<level>] <component>: <message>
```

- `component` = file/module name (`server`, `ai`, `intent`, `storage`).
- Timestamps: only when writing to a log file (`host/data/host.log`), using ISO 8601. Console logs during dev omit timestamps (they clutter).
- **Never log**: full journal content, todo titles, API keys, WebDAV credentials. Log only metadata (day keys, counts, op names).

```js
// good — metadata only
log('info', 'storage', `saved journal ${dayKey}`);

// bad — leaks private content
log('info', 'storage', `saved: ${markdown}`);
```

---

## What to Log

- Log every incoming request (method + path + `ok`/`error.code`) at `debug`; log response failures at `warn`/`error`.
- Log AI provider errors **without** the API key or the full prompt (summarize intent + action).
- Log process start/stop, config source (local model vs API key), and storage file path at `info`.

---

## Common Mistakes

- Logging full journal text or prompts (privacy leak — the host is local but logs may be shared in bug reports).
- Using `console.log` for errors (use `console.error`; stdout must stay protocol-clean).
- Logging at `info` for every AI retry (noisy). Retries are `warn`; final failure is `error`.
