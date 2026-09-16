# Quality Guidelines (Backend)

> Testing, review standards, and security for the Node host.

---

## Testing

- **Unit tests**: **Vitest** (same tool as frontend) for `services/` and `lib/`.
- Test files beside source: `host/services/intent.test.js`, `host/lib/storage.test.js`.
- Mock the LLM client in tests — never make real API calls in CI.
- **Intent parser** (`services/intent.js`) is the highest-value test target: natural language → action mapping needs a broad table of cases.

```bash
cd host && npx vitest run --coverage   # target >80% on services/ + lib/
```

---

## Linting

- ESLint (same config as frontend, `env: node`).
- Enforce `no-console` outside `lib/logger.js` (all logging through logger).

---

## Code Review Checklist (for `trellis-check`)

- [ ] All responses are JSON with `{ ok: true, data }` / `{ ok: false, error: { code } }`
- [ ] No secrets (API key, WebDAV creds) logged or returned in responses
- [ ] Async handlers wrapped — no unhandled rejections can crash the process
- [ ] Storage writes use temp-file + rename (atomic)
- [ ] Inputs validated before touching services/storage
- [ ] `npm test` passes, lint clean

---

## Security Rules

- **Bind to `127.0.0.1` only** — never `0.0.0.0`. This is a local host; exposing it on the network would leak the user's private journal.
- **API key** is read from `chrome.storage.local` (sent by extension over the bridge) or from a local env var — never hardcoded, never logged.
- **Origin check**: if the host exposes plain HTTP (non-MCP), validate an `Origin`/`Host` header and/or a per-session token so only the extension can call it (mitigates DNS rebinding / drive-by from malicious tabs).
- **No eval, no `child_process.exec`** with user input (prefer `execFile` if any shell-out is ever needed).

---

## Performance Rules

- Keep the process lightweight: no heavy deps, no DB — a few hundred KB RAM.
- Cache LLM client instance; don't re-instantiate per request.
- Debounce file writes (batching journal saves) to avoid disk churn.

---

## Forbidden Patterns

| Pattern | Why |
|---------|-----|
| Bind `0.0.0.0` | Exposes private journal to LAN |
| Log API keys / credentials | Secret leak |
| `child_process.exec` with user input | Command injection |
| Unhandled promise rejections | Process crash, silent data loss |
| Non-atomic file writes | Corrupt JSON on crash |
