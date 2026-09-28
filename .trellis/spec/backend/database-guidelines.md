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
  emoji TEXT,                -- 自定义图标（'' = 类型默认）
  title TEXT,                -- 一等标题（'' = 回落 content）
  status TEXT,               -- none | todo | doing | done（null = 由 type+done 推导）
  progress INTEGER,          -- 0-100 | null（done 且 null → 100）
  duration INTEGER,          -- 占用时长（分钟）| null
  props TEXT,                -- 自定义属性 JSON（保留字被过滤）
  project TEXT,              -- 项目目录（一等字段；读空回落 meta.createdBy.project）
  createdAt TEXT, updatedAt TEXT,   -- ISO8601
  deleted INTEGER            -- tombstone (1 = deleted, kept for sync)
)
```

- **统一卡片模型**（阶段 A 重构后）：`status` 取代 `type+done` 的 UI 语义（文本=纯记录 none，待办=todo，进行中=doing，完成=done）。`type/done` 列**物理保留**，仅作历史兼容；读侧用 `statusFromTypeDone(type, done)` 推导：`task+done→done`、`task+not done→todo`、否则 `none`。**status 列必须可空（无 DEFAULT）**——否则 `ALTER TABLE ADD COLUMN ... DEFAULT 'none'` 会把存量 task 卡填成 `none`，推导失效。
- **三层命名空间**：内建字段 / `props.*`（自定义属性）/ `meta.*`（只读系统元数据）。自定义属性永远在 `props` 下，`RESERVED_PROPS` 保留字集过滤内建/系统字段名，杜绝覆盖（如 `title`/`status`）。
- **journals are derived** from `c_mj_<day>` cards — there is no separate journals table (avoids dual sources of truth). `journals`/`todos` are legacy views over cards.
- `settings` (key/value JSON) and `meta` (deviceId, propertyLibrary, templates, savedViews, …) are auxiliary tables.

### 本机配置（属性库 / 模板 / 命名视图）

属性定义库、命名模板、命名视图是**本机配置**，存 `meta` 表 JSON，**不入同步快照**（跨端同步为 out-of-scope，卡片值才同步）：

- `meta['propertyLibrary']` → `{ key: {key,label,icon,type,options[]} }`
- `meta['templates']` → `[{id,name,title,emoji,status,progress,duration,propsDefaults,project,tags}]`
- `meta['savedViews']` → `[{id,name,status,tag,project,layout}]`

读写封装：`getPropertyLibrary/savePropertyLibrary/getTemplates/saveTemplates/getSavedViews/saveSavedViews(store)`；REST：`GET/PUT /api/meta/{propertyLibrary|templates|savedViews}`。

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
- **零丢失加列迁移**（照 tags/meta/emoji 例）：对每个缺失列独立 `VACUUM INTO '<backup>.bak'` → `ALTER TABLE cards ADD COLUMN <col>` → `verifyNoDataLoss(before, after)` → 失败 `copyFileSync(backup,file)` 回滚 + throw。封装为 `migrateAddColumn({db,log,file,cols,column,ddl})`。新增列含 `title/status/progress/duration/props/project`。
- Secrets (GitHub token, WebDAV password) live only in host `settings`; they are never logged and are masked (`*Set: true`) on `GET /api/sync/config`.

---

## Common Mistakes

- Physical delete instead of tombstone → deletions don't propagate and resurrect on sync.
- Creating a second journals store → dual source of truth, drift.
- Blocking the event loop with heavy work on a request (store is sync SQLite; keep handlers small).
- Logging journal content / credentials (privacy leak).
