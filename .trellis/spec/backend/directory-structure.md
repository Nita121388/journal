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
