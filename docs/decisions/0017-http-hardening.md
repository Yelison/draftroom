# 0017 · Hardening: who sets which header, CORS, request limits and the trusted proxy

Status: proposed (2026-10-17, T7.2)

## Decision

### One owner for each header

| Response | Owner | Headers |
| --- | --- | --- |
| `/api/*` | the server (`http/security.ts`) | `Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, and in production `Strict-Transport-Security` |
| The page (`index.html`) | the build (`apps/web/scripts/content-security-policy.ts`) | a `<meta http-equiv="Content-Security-Policy">` with the SHA-256 of every inline script of that page, `'self'`, no `unsafe-inline` or `unsafe-eval` for scripts, `connect-src 'self' wss:` |
| The page and its files | the proxy that serves `dist/` (T8.1) | `frame-ancestors 'none'` (a meta tag cannot say it; send it as its own `Content-Security-Policy` header, which the browser intersects with the meta), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` |

The server serves no HTML, so a CSP header on `/api` cannot protect the page; the hash is computed from the built page, never by hand, and a test compares it with the real `index.html`. `style-src` keeps `'unsafe-inline'`, shown necessary by experiment: the editor sets `style` attributes. The dev server has no policy (its hot reload is an inline script). Headers are written by hand: six constants do not justify a dependency.

### CORS, limits, proxy

- CORS is by `ALLOWED_ORIGINS` (explicit list, never `*`, credentials only for listed origins; `X-Dev-User` is never an allowed header). The collaboration upgrade checks the same list.
- Bodies over 64 KiB are `413 too-large` (the biggest legitimate body is about 34 KiB with every text at its maximum).
- REST: a token bucket per address (50/s, burst 500, before the session is looked up) and per session (10/s, burst 100); health probes are exempt. 429 carries `Retry-After`; the contract's `default` response covers it.
- `TRUST_PROXY` takes addresses or ranges, never `true` or a hop count (Fastify 5 trusts nothing for a number).
- The Vite proxy stays: the client calls relative `/api` and `/collab`, as in production behind one origin, and the suite uses `localhost` and `127.0.0.1`, which are different sites.

Cookie names (`__Host-` in production) and the device cookie against targeted lockout are specified in ADR 0004 (update pending).
