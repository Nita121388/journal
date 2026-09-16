# Type Safety

> How types and validation are handled in this **vanilla JS** project (no TypeScript).

---

## Overview

Journal is built with **plain ES modules** (no TypeScript, no build step). Type safety is maintained via:

1. **Runtime validation** in `lib/store.js` on all data that enters storage.
2. **JSDoc annotations** in `lib/` for editor intellisense and lint.
3. **Strict ESLint** rules (`eslint-plugin-jsdoc`) to enforce JSDoc presence on exported functions.

---

## JSDoc Convention for `lib/` Modules

Every exported function in `lib/` must have a `@param` / `@returns` JSDoc block:

```js
/**
 * @param {string} dayKey — "YYYY-MM-DD"
 * @param {string} markdown
 * @returns {Promise<void>}
 */
export async function saveJournalEntry(dayKey, markdown) {
  // ...
}
```

- Store-module files should also have **@typedef** for the shapes of entries, todos, and settings at the top of the file.
- ESLint `valid-jsdoc` rule is set to **warn** on missing/invalid JSDoc in `lib/`.

---

## Runtime Validation (store boundary)

`lib/store.js` is the only gateway to `chrome.storage.local`. All mutations go through it.

On **read**: validate the shape before returning to the caller.

```js
function isJournalMap(val) {
  return val !== null && typeof val === 'object' && Object.values(val).every(v => typeof v === 'string');
}

/**
 * @returns {Promise<Record<string, string>>}
 */
export async function getAllJournals() {
  const { journals } = await chrome.storage.local.get(KEY.JOURNALS);
  if (!isJournalMap(journals)) return {};
  return journals;
}
```

On **write**: accept only the declared types; throw on invalid input before touching storage.

---

## What Goes in a `@typedef`

Create a single `lib/types.js` (or at the top of `store.js`) with the canonical shapes:

```js
/** @typedef {{ id: string, title: string, done: boolean, due: string|null, priority: 'high'|'medium'|'low' }} TodoItem */

/** @typedef {{ sync: SyncSettings, ai: AISettings, theme: 'auto'|'light'|'dark' }} UserSettings */

/**
 * @typedef {Record<string, string>} JournalMap
 *   keys = "YYYY-MM-DD", values = markdown string
 */
```

---

## Lint Rules

```json
{
  "jsdoc/require-jsdoc": ["warn", { "require": { "ExportedFunctionDeclaration": true } }],
  "jsdoc/require-param": "warn",
  "jsdoc/require-returns": "warn"
}
```

---

## Common Mistakes

- Passing a number where a string key is expected → crash at `chrome.storage.local` write. Validate at the store boundary.
- Trusting `chrome.storage.local.get()` return to always be the right shape — it's not. Storage can contain orphaned keys from prior schema versions. Always validate on read.
- Never silently swallow errors on store read — log and return the safe empty default, don't propagate undefined.
