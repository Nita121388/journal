# Directory Structure (Backend)

> How the Node.js local host code is organized.

---

## Overview

The **backend** of Journal is the `host/` directory: a **local Node.js process** that provides the AI layer to the extension. It reuses the `tabshelf-host` pattern — a local HTTP/MCP server the extension talks to over `localhost`. There is no remote server; everything runs on the user's machine.

---

## Directory Layout

```
host/
├── package.json          # Node host deps + scripts
├── index.js              # Entry point: starts the local server / MCP host
├── server.js             # HTTP/MCP server — receives extension requests
├── routes/
│   ├── journal.js        # AI CRUD on journal entries ("today?" / "add to 7/8")
│   └── todo.js           # AI CRUD on todos ("mark Monday's todo done")
├── services/
│   ├── ai.js             # LLM client (local model or API key)
│   └── intent.js         # natural-language → structured action parser
├── lib/
│   └── storage.js        # Reads/writes the same chrome.storage-shaped data
└── test/
    └── ...
```

---

## Module Organization

- **`index.js`** — bootstrap only: read config, start server, wire routes. No business logic.
- **`routes/`** — request handlers. Thin: parse request → call service → return JSON.
- **`services/`** — business logic: AI calls, intent parsing, CRUD operations.
- **`lib/`** — shared helpers (storage access, validation, logging).
- Keep `routes/` thin and `services/` deep (logic lives in services).

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
