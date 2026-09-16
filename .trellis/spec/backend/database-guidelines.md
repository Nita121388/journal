# Database Guidelines (Backend)

> Data persistence for the Node host: local JSON files mirroring the extension's storage shape.

---

## Overview

Journal keeps all data **local**. The extension writes to `chrome.storage.local`; the **host** does not use a database — it reads/writes the same logical data via a **local JSON file** (or directly manipulates the extension's storage through the native messaging bridge when available). The canonical source of truth remains the extension's `chrome.storage.local`.

---

## Storage Model (mirrors frontend schema)

```json
{
  "journals": { "2026-09-16": "markdown...", "2026-09-17": "..." },
  "todos": [ { "id": "uuid", "title": "...", "done": false, "due": null, "priority": "medium" } ],
  "settings": { "sync": {...}, "ai": {...} }
}
```

- **`journals`** — `Record<string, string>`: day key → markdown.
- **`todos`** — array of `{ id, title, done, due, priority }`.
- Host reads/writes this exact shape so it can hand data back to the extension without transformation.

---

## Access Patterns

- `host/lib/storage.js` exposes `getData()`, `setData(patch)`, `getJournal(dayKey)`, `saveJournal(dayKey, text)`.
- **Atomic writes**: write a temp file + `fs.rename` to avoid corrupting the JSON on crash:

```js
const tmp = `${file}.tmp`;
await fs.writeFile(tmp, JSON.stringify(data, null, 2));
await fs.rename(tmp, file);
```

- Debounce/queue concurrent writes; never let two async writes interleave.

---

## Concurrency & Race Protection

- Host is single-process, single-writer: serialize all writes through one queue in `lib/storage.js`.
- The extension's `chrome.storage.onChanged` → re-reads host file; host must not write while the extension is mid-read. Use a monotonic `version` field if cross-process sync is ever added.

---

## Naming & Validation

- Data file: `host/data/journal.json` (gitignored — contains user's private journal).
- Validate on load: if JSON is corrupt, back it up to `journal.json.bak` and start fresh (never silently lose old data).
- IDs: `crypto.randomUUID()`.

---

## Common Mistakes

- `fs.writeFile` directly on the live file (crash → corruption). Always temp + rename.
- Two async writes racing (last write wins with partial data). Serialize.
- Letting the host own a **different** data shape than the extension → sync bugs. Mirror the schema exactly.
