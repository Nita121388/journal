# Database Guidelines (Backend)

> Data persistence for the Node host: **SQLite** (local, `node:sqlite`) as the single source of truth, with a JSON fallback and cross-device sync.

---

## Overview

Journal keeps all data **local**. The **host** owns the authoritative store:

- **Primary**: SQLite via `node:sqlite` (`host/lib/storage.js`) → `host/data/journal.db`.
- **Fallback**: if `node:sqlite` is unavailable (older Node), an equivalent JSON-file store is used automatically — same interface, same semantics.
- The extension's `chrome.storage.local` is only a **mirror cache**; it pulls from host and writes back through the REST API.

The canonical source of truth is the **host SQLite store**. Sync replicates it across devices (see `host/sync/`).

---

## Data Model

Single unified `cards` table (see `host/lib/storage.js`):

```sql
cards(
  id TEXT PRIMARY KEY,       -- c_* ; journals use c_mj_<day>, todos c_mt_<uuid>
  content TEXT, type TEXT,   -- text | task | idea
  done INTEGER,              -- 0/1
  assignedDate TEXT,         -- YYYY-MM-DD (null = card pool)
  time/startTime/endTime TEXT,
  priority TEXT,             -- high | medium | low
  tags TEXT,                 -- JSON string array, normalized trim+lowercase
  createdAt TEXT, updatedAt TEXT,   -- ISO8601
  deleted INTEGER            -- tombstone (1 = deleted, kept for sync)
)
```

- **journals are derived** from `c_mj_<day>` cards — there is no separate journals table (avoids dual sources of truth). `journals`/`todos` are legacy views over cards.
- `settings` (key/value JSON) and `meta` (deviceId, lastSyncAt, …) are auxiliary tables.

---

## Access Patterns

- All access goes through the store returned by `createStore({ file, jsonFile })`:
  `listCards`, `getCard`, `createCard`, `updateCard`, `deleteCard`, `applyMergedCards`,
  `getJournals`, `setJournal`, `deleteJournal`, `getSettings`, `setSettings`, `getMeta`, `setMeta`, `getDeviceId`.
- Writes are **transactional** (single upsert per card); the JSON fallback writes temp-file + `rename` (atomic).
- Delete = **tombstone** (`deleted=1`), never physical delete — required so deletions propagate across devices.

---

## Sync (host/sync/)

| Module | Role |
|--------|------|
| `sync/merge.js` | pure LWW + tombstone merge (no IO) |
| `sync/backplane.js` | pluggable transport: Memory / LocalFolder / WebDAV / GitHub |
| `sync/engine.js` | `runSync`: pull → merge → persist → push |

- Merge is **transport-agnostic**: swapping GitHub for WebDAV is a new Backplane class, zero merge changes.
- Snapshot: `{ schemaVersion, deviceId, generatedAt, cards[] }` (cards include tombstones).

---

## Migration & Compatibility

- On first start, legacy `host/data/journal-data.json` is migrated idempotently into the store; a `.migrated.bak` copy is written first.
- The REST contract (`/api/cards`, `/api/journals`, `/api/todos`, …) is unchanged, so the extension/CLI keep working.
- Secrets (GitHub token, WebDAV password) live only in host `settings`; they are never logged and are masked (`*Set: true`) on `GET /api/sync/config`.

---

## Common Mistakes

- Physical delete instead of tombstone → deletions don't propagate and resurrect on sync.
- Creating a second journals store → dual source of truth, drift.
- Blocking the event loop with heavy work on a request (store is sync SQLite; keep handlers small).
- Logging journal content / credentials (privacy leak).
