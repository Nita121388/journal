# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

The **frontend** of this project is the Chrome MV3 extension under `extension/` — plain ES modules, no framework, no build step. Main UI = side panel (`sidepanel.html/js`); settings = `options.html/js`; shared logic = `lib/`.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Extension layout, entry files, `lib/` modules | ✅ Filled |
| [Component Guidelines](./component-guidelines.md) | Render-function components, `textContent` over `innerHTML` | ✅ Filled |
| [Hook Guidelines](./hook-guidelines.md) | `lib/` module conventions, purity rules, dependency graph | ✅ Filled |
| [State Management](./state-management.md) | `chrome.storage.local` schema, store-only access, `onChanged` | ✅ Filled |
| [Quality Guidelines](./quality-guidelines.md) | ESLint, Vitest coverage, CSP, forbidden patterns | ✅ Filled |
| [Type Safety](./type-safety.md) | JSDoc `@typedef`, runtime validation at store boundary | ✅ Filled |

---

## Pre-Development Checklist

Before writing any extension code, confirm:

- [ ] New file is in the right place per [Directory Structure](./directory-structure.md)
- [ ] No DOM + storage mixing (see [Hook Guidelines](./hook-guidelines.md) dependency graph)
- [ ] Render functions are pure + idempotent per [Component Guidelines](./component-guidelines.md)
- [ ] Any new storage field is documented in the [State Management](./state-management.md) schema and validated in `lib/store.js`
- [ ] JSDoc added per [Type Safety](./type-safety.md)

---

## Quality Check

- [ ] `npx eslint extension/` — 0 errors
- [ ] `npx vitest run --coverage` — `lib/` coverage > 80%
- [ ] Loads clean in `chrome://extensions`, side panel opens, console error-free
- [ ] No `eval` / `new Function` / `innerHTML` with user content
