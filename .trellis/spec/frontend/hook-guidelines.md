# Hook & Module Guidelines

> Conventions for the extension's `lib/` ES modules and their exported helpers (this project's equivalent of "hooks").

---

## Overview

Journal has no React hooks. The functional equivalent is the **`lib/` module layer** — pure functions that encapsulate one concern (storage, model, sync, AI). This file sets the conventions for writing those modules.

---

## Module Naming & Organization

- One concern per file: `store.js` (storage), `model.js` (aggregation), `sync.js` (WebDAV/file), `ai.js` (AI client).
- Helper modules live in `lib/ui/` when they render DOM (`heatmap.js`, `todo-list.js`).
- A module file should be **< 200 lines**; split further if it grows (e.g. `store/migrations.js`).

---

## Function Conventions

```js
// lib/model.js
/**
 * @param {JournalMap} journals
 * @returns {Record<string, number>} dayKey -> entry count (for heatmap)
 */
export function aggregateHeatmap(journals) {
  // pure function — no side effects, no storage reads
}
```

- **Pure by default**: same input → same output, no side effects. Side-effecting modules (store, sync) clearly state so in their file header.
- **Async-returning**: storage/sync functions return Promises; callers `await`.
- Prefix conventions:
  - `get*` → read (may hit storage)
  - `save*` / `set*` → write
  - `merge*` / `diff*` → sync/mutation
  - `aggregate*` / `count*` / `filter*` → pure derivation
  - `render*` → DOM rendering (must take a container as first arg)
- Never export a function that both reads storage **and** renders DOM. Split into a `load` + `render` pair.

---

## Module Boundaries (dependency rules)

```
sidepanel.js / options.js   (entry — may import anything)
   │
   └── lib/store.js ──────── chrome.storage.local ONLY
   │        │
   │        └── lib/model.js (pure derivation, imports nothing)
   │
   ├── lib/sync.js ───────── imports store.js (reads/writes journals + tombstones)
   ├── lib/ai.js ─────────── imports store.js (reads settings)
   └── lib/ui/*.js ───────── imports nothing except DOM
```

Rules:
- `lib/model.js` **must not** import anything (pure).
- Only `lib/store.js` touches `chrome.storage.*`.
- `lib/sync.js` and `lib/ai.js` depend on `lib/store.js`, never on each other.
- Entry files are the only place allowed to import both `lib/store.js` and `lib/ui/*.js`.

---

## Exceptions (approved)

**`lib/host-sync.js`** may directly call `chrome.storage.local.get/set` for cross-group atomic reads during host synchronization. This exception is documented in the file header. Do not extend this exception to new modules.

## Common Mistakes

- Putting storage calls inside a "pure" derivation function → makes it untestable.
- A module that reads storage **and** writes DOM → split.
- Circular imports between `store.js` ↔ `sync.js` → sync should only consume store, never be imported by it.
