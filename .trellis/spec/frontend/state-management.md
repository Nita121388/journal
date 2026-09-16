# State Management

> How state is managed in the extension.

---

## Overview

There is **no Redux/MobX/Zustand**. All persistent state lives in **`chrome.storage.local`**, accessed through a thin `lib/store.js` wrapper. UI ephemeral state (open modal, typing text) is held in plain module-level variables in the entry file.

---

## State Categories

| Layer | Where | Example |
|-------|-------|---------|
| **Persistent state** | `chrome.storage.local` | Journal entries, todo items, settings |
| **Derived state** | Computed at render time | Today's key, heatmap aggregation, filtered todo list |
| **Ephemeral UI state** | Module-scoped variables in entry file | Active modal, current filter, whether sidebar is open |

---

## Storage Schema (planned)

Everything under `chrome.storage.local` is namespaced with top-level keys:

```js
{
  "journals": { "2026-09-16": "## 14:00 项目启动\n...", ... },
  "todos": [
    { "id": "uuid", "title": "...", "done": false, "due": "2026-09-17", "priority": "medium" }
  ],
  "settings": {
    "sync": { "provider": "webdav", "endpoint": "...", "enabled": false },
    "ai": { "provider": "local", "apiKey": "" },
    "theme": "auto"
  }
}
```

- Keys are **static strings** (never dynamic/computed — use structured storage under them).
- Schema evolves via explicit versioning in `lib/store.js` (`STORAGE_VERSION` + migration function).

---

## Read / Write Patterns

```js
// lib/store.js
const KEY = { JOURNALS: 'journals', TODOS: 'todos', SETTINGS: 'settings' };

export async function getTodayEntry() {
  const key = todayKey(); // "2026-09-16"
  const { journals } = await chrome.storage.local.get(KEY.JOURNALS);
  return journals?.[key] ?? '';
}

export async function saveTodayEntry(markdown) {
  const key = todayKey();
  const { [KEY.JOURNALS]: journals = {} } = await chrome.storage.local.get(KEY.JOURNALS);
  journals[key] = markdown;
  await chrome.storage.local.set({ [KEY.JOURNALS]: journals });
}
```

Rules:
- Always **single atomic write** per mutation (never read-write-then-read-write in a race).
- `lib/store.js` is the **only** file that calls `chrome.storage.local` directly. All other modules call store functions.

---

## Reactive Updates

`chrome.storage.local` provides `onChanged` listeners:

```js
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.journals) renderToday();   // re-render on external edit
  if (changes.todos) renderTodoList();
});
```

This is how sync writes (from WebDAV poll) update the UI without manual re-render.

---

## When to Promote to Storage

Promote a variable from in-memory to `chrome.storage.local` **only** when:
1. It must survive a service worker wake-up or page reload, OR
2. It must be read from a different context (background.js, options page).

Everything else stays in memory.

---

## Common Mistakes

- Storing a full object in storage, reading it, mutating a nested field, writing back the whole object → **lost concurrent writes**. Read only the part you need.
- Direct `chrome.storage.local.set()` in the UI layer → skipped store validation logic. Always use `lib/store.js` functions.
- No schema versioning → silent data corruption on update migrations.
