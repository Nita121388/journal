# Quality Guidelines (Backend)

> Testing, review standards, and security for the Node host.

---

## Testing

- **Unit tests**: Node's built-in **`node:test`** (no third-party deps) for `lib/` and `sync/`.
- Test files live in `host/test/*.test.mjs`. Mock external transports by injecting a `fetchImpl`; never hit the network in tests.
- Highest-value targets: `sync/merge.js` (LWW + tombstone table), `sync/engine.js` (two-device convergence), `lib/storage.js` (CRUD + migration).

```bash
cd host && npm test            # node --test
cd host && node --test test/merge.test.mjs
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
- **Secrets** (sync tokens / WebDAV passwords) live in host settings, are **never logged**, and are masked on `GET /api/sync/config`.
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
