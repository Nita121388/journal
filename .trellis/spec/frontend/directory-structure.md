# Directory Structure

> How the Chrome extension (frontend) code is organized in this project.

---

## Overview

The Journal project is a **Chrome Manifest V3 extension** with a **Side Panel** UI. There is no build step — plain JavaScript ES modules, no framework. All user-facing code lives under `extension/`.

---

## Directory Layout

```
extension/
├── manifest.json        # MV3 configuration (side_panel, permissions, icons)
├── background.js        # Service Worker (MV3) — message routing, alarms
├── sidepanel.html       # Main UI (side panel entry point)
├── sidepanel.js         # Main UI logic (ES module)
├── sidepanel.css        # Main UI styles
├── options.html         # Settings page (WebDAV/sync/AI provider config)
├── options.js
├── options.css
├── lib/
│   ├── store.js         # Data layer: chrome.storage.local read/write
│   ├── model.js         # Data model: journal entries, todos, heatmap aggregation
│   ├── sync.js          # Sync engine: WebDAV / local file, LWW merge + tombstones
│   └── ai.js            # AI client: local host (MCP) or API key
└── icons/
    └── ...              # Extension icons (16/32/48/128)
```

---

## Module Organization

- **`lib/` = pure logic, no DOM.** Everything that touches `chrome.storage`, sync, or AI must be a plain ES module in `lib/` with no `document`/`window` references (so it is testable in isolation).
- **Entry files** (`sidepanel.js`, `options.js`) = thin glue: wire DOM events → call `lib/` functions → render.
- **No framework, no bundler.** Use ES modules (`<script type="module">`) and relative imports only.
- Feature code goes in `lib/` when shared (store/model/sync/ai); page-specific rendering stays in the entry file or a small `lib/ui/` helper module if a page grows.

---

## Naming Conventions

| Item | Rule |
|------|------|
| Files | `kebab-case.js` / `.css` / `.html` |
| Functions | `camelCase`, verb-first: `getTodayKey()`, `saveEntry()`, `mergeRemote()` |
| Constants | `UPPER_SNAKE_CASE` for module-level config (e.g. `SYNC_INTERVAL_MS`) |
| CSS classes | `kebab-case`, prefixed by component: `.heatmap-cell`, `.todo-item` |
| Chrome message types | `SCREAMING_SNAKE_CASE` strings, namespaced: `"journal:save-entry"` |

---

## Examples

- `lib/store.js` — all storage access
- `lib/model.js` — heatmap aggregation & todo status helpers
- `lib/sync.js` — LWW merge + tombstone logic
