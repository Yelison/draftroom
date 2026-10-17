# 0015 · Who a browser is in the real-stack end-to-end suite, until the session cookie exists

Status: superseded by [0004](0004-authentication.md) (2026-10-17, T7.1): a browser is its session cookie, and what remains of the proxy only routes `/api` and `/collab`

## Context

The suite of `apps/web/e2e-collab` drives two browsers against the real server (T2.4). A browser has to be someone for both doors of the server:

- **REST** takes the identity from the `X-Dev-User` header (ADR 0010), which a test can put on every request.
- **The collaboration WebSocket** takes it from the headers of the upgrade request (protocol §3: nothing in the address, never a token in the URL). A browser cannot set a header on a WebSocket, and the cookie the real sessions will use (T7.1) does not exist yet.

Until T7.1 there is no way for a real browser to open a collaboration connection as a person. The server must not change for a test: the development identity is what it has, and a door that reads something else would be a door that exists in production.

## Decision

1. **A proxy in the Vite servers of development and preview** (`vite.config.ts`) serves `/api` and `/collab` from the origin of the app, as production does behind its reverse proxy (plan §3.3), and copies the value of a test cookie, `dr_dev_user`, to `X-Dev-User` on every request it forwards, WebSocket upgrades included. A header the browser sent itself is dropped first: the identity is only ever the cookie's.
2. **Each Playwright browser context sets the cookie** to the email of the person it is (`context.addCookies`). The server does not change, and neither does the client: it talks to its own origin, as it does in production.
3. **The proxy exists only when both targets are named in the environment** (`E2E_API_ORIGIN`, `E2E_COLLAB_ORIGIN`), which the Playwright configuration of the suite sets and nothing else does. `command === 'serve'` is not enough: `vite preview` of a production build also runs as `serve`. A build never holds the proxy or the cookie's name (`productionBuild.spec.ts` searches the bundle), and a server started without the variables has no proxy and ignores the cookie (`vite.config.test.ts`).
4. **The collaboration server allows the origin of the app** (`ALLOWED_ORIGINS`), because a browser always sends `Origin` with an upgrade and the guard refuses any that is not listed. That is configuration the server already has.

## Consequences

- The suite tests the same paths a user will: the client opens `/collab` on its own origin, the server authenticates from the headers of the upgrade, and the revocation of a connection is the server's own.
- The cookie is an identity anyone can set, so the proxy is development tooling in the same sense as `X-Dev-User`: it serves only where the environment asks for it and nothing deployed has it.
- **T7.1 replaces all of it.** The session cookie is HttpOnly, rotated at sign-in and resolved by the server; the suite then signs each context in (or plants a session) and `dr_dev_user`, the proxy, the two variables and this decision go away. The tests of the suite do not change: they only ever say who a context is.
- The proxy is a second hop for REST and WebSocket traffic, which is also where a reverse proxy sits in production; a defect in how the real one forwards upgrades is not covered by this suite.

## Alternatives considered

- **The server accepts the cookie as the development identity.** Rejected: it changes the server for a test and adds a second way to be somebody, in the code that decides who may read what.
- **The identity in the query string or in a WebSocket sub-protocol.** Rejected: the protocol forbids tokens in the URL, and the server would need to read what it must not.
- **`page.routeWebSocket`, or a WebSocket injected by the page, to add the header.** Rejected: it replaces the browser's own connection, so what the suite would prove is the replacement, and the origin the server sees would not be the app's.
- **Serving the built app and the servers behind a real reverse proxy (Caddy, nginx) in the suite.** Rejected for now: it is the right shape for a check of the deployment, but it needs a second piece of infrastructure to carry the same cookie-to-header rule, and a third place for it to go wrong.
