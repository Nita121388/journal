# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

The **backend** is the `host/` directory: a **local Node.js process** that provides storage + CRUD (and cross-device sync) to the extension and CLI over `localhost`. It binds to `127.0.0.1` only; no remote server. Data lives in a local **SQLite** store (`node:sqlite`).

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | `host/` layout, `lib/` store, `sync/` engine | ✅ Filled |
| [Database Guidelines](./database-guidelines.md) | SQLite store, tombstones, migration, sync | ✅ Filled |
| [Error Handling](./error-handling.md) | Structured `{ ok, error: { code } }` responses, async handler wrapper | ✅ Filled |
| [Logging Guidelines](./logging-guidelines.md) | `[host][level] component: msg`, no secrets logged | ✅ Filled |
| [Quality Guidelines](./quality-guidelines.md) | `node:test`, `127.0.0.1` bind only, no eval, input validation | ✅ Filled |

---

## Pre-Development Checklist

Before writing any host code, confirm:

- [ ] New file goes in the right place per [Directory Structure](./directory-structure.md)
- [ ] Validation happens before storage access
- [ ] LLM call errors are caught and returned as `502 AI_ERROR`
- [ ] No secrets (API key, credentials) logged or returned
- [ ] Handler is wrapped with `asyncHandler()` (see [Error Handling](./error-handling.md))

---

## Quality Check

- [ ] `npm test` passes (`node --test`, covers `lib/` + `sync/`)
- [ ] `npx eslint host/` — 0 errors
- [ ] Host binds to `127.0.0.1` only; log shows `listening on 127.0.0.1:<port>`
- [ ] Responses always `{ ok, data/error }`, never raw stack traces
