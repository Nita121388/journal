# Quality Guidelines (Frontend)

> Linting, testing, and code review standards for the Chrome extension.

---

## Linting

**Tool:** ESLint with strict vanilla JS config (no framework rules).

```json
{
  "env": { "browser": true, "es2024": true },
  "parserOptions": { "ecmaVersion": "latest", "sourceType": "module" },
  "rules": {
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-script-url": "error",
    "no-unsafe-innerhtml/no-unsafe-innerhtml": "error",
    "jsdoc/require-jsdoc": "warn",
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

Run: `npx eslint extension/` before every commit.

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
