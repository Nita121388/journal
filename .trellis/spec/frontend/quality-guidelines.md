# Quality Guidelines (Frontend)

> Linting, testing, and code review standards for the Chrome extension.

---

## Linting

**Tool:** ESLint flat config（`extension/eslint.config.js`，ESLint 9；`extension/package.json` 的 `npm run lint`）。适配原生 ESM + Chrome 扩展 globals。

```js
// extension/eslint.config.js 要点
rules: {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
}
```

> 注：`no-unsafe-innerhtml` 来自 `eslint-plugin-no-unsanitized`（未装），innerHTML 安全由 Code Review 人工门把关；`jsdoc/require-jsdoc` 需 jsdoc 插件（未装），作为人工项。

Run: `cd extension && npm run lint`（即 `npx eslint .`）before every commit.

> **已知基线缺口（2026-09-30 实测）**：`sidepanel.js` 存在 23 处存量 `no-unused-vars`（死 import/未用变量，如 `aggregateHeatmap`/`groupCardsForTimeline`/`switchSeq` 等），非本次引入。清理留待独立重构任务；本任务验收以「不新增 lint 错误」为准。

---

## Testing

- **Unit tests** (for `lib/` functions): use **Vitest** (node runner, no browser) + `jsdom` for DOM helpers in `lib/ui/`.
- Test files live beside source: `lib/store.test.js`, `lib/model.test.js`.
- **No e2e tests at bootstrap** (can add Playwright later for full extension test).
- Aim for **>80% coverage on `lib/`** at all times. Run via:

```bash
npx vitest run --coverage
```

---

## Code Review Checklist (for `trellis-check`)

- [ ] No user input in `innerHTML` — use `textContent`
- [ ] All storage access is inside `lib/store.js` (not directly from UI code)
- [ ] JSDoc present on all exported `lib/` functions
- [ ] `npm run lint` passes with 0 errors
- [ ] `npm run test` passes
- [ ] Chrome extension loads without errors in `chrome://extensions`
- [ ] `manifest.json` permissions are minimal (no `*://*/*` host permissions)

---

## Performance Rules

- Debounce free-text input saves (`debounce(saveTodayEntry, 500)`) — never write on every keystroke.
- `chrome.storage.local.get()` reads are async; never block render on them — fetch, then populate.
- Keep the side panel DOM light: use event delegation, not per-item listeners.
- Avoid repeated `chrome.storage.local.get(KEY)` in loops — read once, pass around.

---

## Security Rules

- **Content Security Policy (CSP):** MV3 enforces `script-src 'self'`. Never use `eval()` or `new Function()`.
- **Remote sync:** WebDAV credentials are stored in `chrome.storage.local` (encrypted at rest by Chrome). Never log them.
- **AI API key:** stored in `chrome.storage.local`, never sent to any server other than the configured AI provider.

---

## Forbidden Patterns

| Pattern | Why |
|---------|-----|
| `innerHTML` with user content | XSS |
| Direct `chrome.storage.*` outside `lib/store.js` | Data integrity loss |
| `eval()` / `new Function()` | CSP violation, security |
| Synchronous `XMLHttpRequest` | Blocks UI thread |
| Global mutable state (no `const`/`let`) | Race conditions |
