# 0017 · Hardening: who sets which header, CORS, request limits and the trusted proxy

Status: proposed (2026-10-17, T7.2)

## Decision

### One owner for each header

| Response | Owner | Headers |
| --- | --- | --- |
| `/api/*`, and any plain request to the `/collab` port | the server (`http/security.ts`, `collab/upgradeGuard.ts`) | `Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` (every answer is about someone), `Referrer-Policy: no-referrer`, `Permissions-Policy`, in production `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`, as in ADR 0016 and the proxy's own headers: a browser keeps the last policy it saw, so they say one thing); CORS by `ALLOWED_ORIGINS`; the limits. The collaboration port answers a request that is not an upgrade with `404` and these same headers (Hocuspocus's welcome text is replaced); the `Origin` of an upgrade is checked against the same list and refused with a bare `403` |
| The page and its files | the proxy that serves `dist/` (T8.1) | the snippet `scripts/security-headers-caddy.ts` generates from the built `index.html`: the full CSP (the hash of every inline script, plus `frame-ancestors 'none'`), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS. Imported inside the block that serves files only: the proxy adds no document header to `/api` or `/collab` |
| The page, wherever it is served | the build (`scripts/content-security-policy.ts`) | the same policy without `frame-ancestors`, as a `<meta>` right after the encoding |

**Why both a meta and a header.** The browser applies every policy it is given and takes the intersection, so the header of the proxy only tightens the meta. The meta is what makes the policy travel with the file: `vite preview` (the end-to-end suites, which do not pass through Caddy), the static demo and any host that serves `dist/` get a policy with the right hashes. The suites check violations with the `securitypolicyviolation` listener against that meta. The dev server (`vite`) has no policy, because its hot reload is an inline script; the first run of `preview` or a built suite is where a violation shows. The snippet is generated and compared with the built page by a test, so a script that changes cannot leave a stale hash; the `Dockerfile` of T8.1 runs the generator in its web-build stage.

The server serves no HTML, so its CSP protects nothing about the page; the hash is computed from the built page, never by hand. `style-src` keeps `'unsafe-inline'`, shown necessary by experiment: TipTap and ProseMirror inject `<style>` elements at run time (a build with `style-src 'self'` and only `style-src-attr 'unsafe-inline'` fails with `style-src-elem` violations from the editor chunks), and the editor sets `style` attributes. Removing it means turning off TipTap's CSS injection and shipping that CSS in a stylesheet of the product, in `features/editor`, which is another task's; `img-src 'self'` already keeps a `url()` in a style from loading anything foreign. Headers are written by hand: a handful of constants do not justify a dependency.

### CORS, limits, proxy

- CORS is by `ALLOWED_ORIGINS` (explicit list, never `*`, credentials only for listed origins; `X-Dev-User` is never an allowed header). The collaboration upgrade checks the same list.
- Bodies over 64 KiB are `413 too-large` (the biggest legitimate body is about 34 KiB with every text at its maximum).
- REST: a token bucket per address (50/s, burst 500, before the session is looked up) and per session (10/s, burst 100); health probes are exempt. 429 carries `Retry-After`; the contract's `default` response covers it.
- `TRUST_PROXY` takes addresses or ranges (never `true`, a hop count or a `/0`, all refused at start-up with `Invalid configuration:`; Fastify 5 trusts nothing for a number).
- Limits per address count an IPv6 address by its **/64** (a home connection is given one, and 2^64 buckets would be one per address), the sign-in limits of ADR 0004 included.
- The Vite proxy stays: the client calls relative `/api` and `/collab`, as in production behind one origin, and the suite uses `localhost` and `127.0.0.1`, which are different sites.

Cookie names (`__Host-` in production) and the device cookie against targeted lockout are specified in [ADR 0004](0004-authentication.md). There are three cookies: `dr_session`, `dr_csrf` and `dr_device`.

## Threats with a test (plan §9.3)

| Threat | Test |
| --- | --- |
| Reading another workspace's document by id (REST and WebSocket) | `apps/server/test/isolation.test.ts`, `apps/server/test/collab/authenticate.test.ts` |
| Viewer or commenter writing content | `apps/server/test/collab/readonly.test.ts` |
| Revoked user keeps editing | `apps/server/test/collab/revocation.test.ts`, `apps/web/e2e-collab/revocation.spec.ts` |
| Spoofed presence identity | `apps/server/test/collab/awareness.test.ts` |
| Script injection by paste or link | `apps/web/src/features/editor/sanitizePaste.test.ts`, `packages/editor-schema/src/links.test.ts`, the pasting block of `apps/web/e2e/editor.spec.ts` (now also under the CSP) |
| CSRF on unsafe methods | `apps/server/test/auth/csrf.test.ts`, `apps/server/test/security/cookies.test.ts` (a planted CSRF cookie) |
| Session fixation, cookie flags, cookie tossing | `apps/server/test/auth/session.test.ts`, `apps/server/test/security/cookies.test.ts` |
| Oversized messages or documents | `apps/server/test/collab/limits.test.ts`, `apps/server/src/http/body-limit.test.ts`, `apps/server/test/security/rest-limits.test.ts` |
| Floods (REST and sign-in) | `apps/server/src/http/request-limits.test.ts`, `apps/server/test/security/rest-limits.test.ts`, `apps/server/test/auth/rate-limit.test.ts` |
| Targeted lockout of an account | `apps/server/test/security/targeted-lockout.test.ts` |
| Another site reading the API or opening the socket | `apps/server/src/http/cors.test.ts`, `apps/server/src/collab/upgradeGuard.test.ts`, `apps/server/test/collab/authenticate.test.ts` |
| Script injection into the page that the CSP stops | `apps/web/scripts/content-security-policy.test.ts`, `apps/web/e2e/csp.spec.ts`, `apps/web/e2e-collab/csp.spec.ts`, `apps/web/e2e/production-bundle.spec.ts` |
| Enumeration through 403 vs 404 | `apps/server/test/access-matrix.test.ts` |
| Demo or development identity in production | `apps/web/e2e/production-bundle.spec.ts`, `apps/server/src/main.test.ts`, `apps/server/test/security/production-start.test.ts` |
