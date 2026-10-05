# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

The **frontend** of this project is the Chrome MV3 extension under `extension/` — plain ES modules, no framework, no bundler. Main UI = side panel (`sidepanel.html/js`); settings = `options.html/js`; shared logic = `lib/`.

Styling: hand-written CSS (`sidepanel.css`) **plus** an optional pure-CSS Tailwind v4 build (`src/tailwind.css` → `dist/sidepanel.css`, committed; `npm run build:css`). No JS bundler, no framework — see [Design System](./design-system.md) §8.1 for the token bridge and migration rules.

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
| [Design System](./design-system.md) | 设计 token 三层 / 组件规范 / 动效 / 可访问性硬门 / 反模式 | ✅ Filled |
| [dev-loop](./dev-loop.md) | Agent 自主验证扩展 UI 的闭环（多宽度截图 + 断言 + 报告） | ✅ Filled |

---

## Pre-Development Checklist

Before writing any extension code, confirm:

- [ ] New file is in the right place per [Directory Structure](./directory-structure.md)
- [ ] No DOM + storage mixing (see [Hook Guidelines](./hook-guidelines.md) dependency graph)
- [ ] Render functions are pure + idempotent per [Component Guidelines](./component-guidelines.md)
- [ ] Touching card fields (add/rename/type/建卡落位)? Field data flows through the **Field Registry** — see Field Registry section in [Component Guidelines](./component-guidelines.md); never reintroduce `findPropDef`/`BUILTIN_DEFS` dispatch or `switch(key)` for field values
- [ ] Any new storage field is documented in the [State Management](./state-management.md) schema and validated in `lib/store.js`
- [ ] JSDoc added per [Type Safety](./type-safety.md)

---

## Quality Check

- [ ] `cd extension && npm run lint` — 0 errors（或不新增，见基线缺口说明）
- [ ] `npx vitest run --coverage` — `lib/` coverage > 80%
- [ ] Loads clean in `chrome://extensions`, side panel opens, console error-free
- [ ] No `eval` / `new Function` / `innerHTML` with user content
- [ ] UI 改动后 `node dev-loop/dev-loop.mjs --width 360,400,500` 回归全绿（见 [dev-loop](./dev-loop.md)）
