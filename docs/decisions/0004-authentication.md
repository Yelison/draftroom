# 0004 · Authentication: passwords, sessions, CSRF and the limit on attempts

Status: proposed (2026-10-17, with sign-up, sign-in and sessions)

## Context

Until now the server knew who was calling from a development header (`X-Dev-User`, ADR 0010) and nobody could sign in. This decision gives people real accounts and keeps the boundary ADR 0010 drew: routes see a `Principal`, and an `AuthProvider` decides who it is, so signing in changed the provider and not a route.

The mistakes that matter here are the ones that let someone in who should not be in: a guessable or stolen session, a session that survives a sign-out, a request another site can forge, a refusal that tells an attacker which accounts exist, and a secret in a log. The contract (`docs/api/README.md`) left four questions to this decision; they are answered below, each in its own section.

## Decision

### Passwords: Argon2id, normalised, checked the same for everyone

- **Argon2id** (`@node-rs/argon2`) with 19 MiB of memory, 2 passes and 1 lane: the first configuration of OWASP's Password Storage Cheat Sheet. It takes about 70 ms on a development laptop. That is enough to make each guess cost something and little enough that a burst of sign-ins does not queue on a small server (the memory is held for the 70 ms and freed). The parameters are written in the hash itself, so they can be raised later without a migration: a hash made with older ones still verifies. Re-hashing at sign-in when the parameters change is not built; it is the first thing to add when they do.
- **NFKC normalisation** before hashing and checking, as NIST SP 800-63B asks (answering the contract's question "NFKC or not at all"). The same password typed with a composed é or an e and a combining accent, or with full-width letters, is the same password. The contract's limits (12–128 code points) count the password as it was sent, before normalisation.
- **The limits are the contract's**: 12 to 128 code points, no rules of composition (NIST: length over composition), no blocklist in this task. `signIn` only requires a non-empty password up to 128, so that nobody whose password was valid under an older rule is locked out.
- **Constant-time comparison.** The library compares the digests in constant time. The one place where time could still tell something is an address with no account, where there is no hash to check: the server checks the password against the hash of a random password nobody knows, made once with the same function and parameters as the real ones, so the work is the same. A test watches that the check runs, and that its hash has the parameters above.

### Sessions: random, hashed, in PostgreSQL, and rotated

- **The token** is 32 random bytes (256 bits) from `crypto.randomBytes`, base64url. **Only its SHA-256 is stored** (`sessions.token_hash`), so a copy of the table cannot be used to sign in. A fast hash is right for a value that already has 256 bits of entropy, and looking the session up by the hash needs no comparison that could be timed: the attacker does not choose the bytes that are compared.
- **Rotation.** Signing in or signing up always starts a new session with a new token, and ends the session the browser presented, whoever it belonged to, in the same transaction. A token is never accepted because the client chose it, so a session id planted in a browser (session fixation) is not the one that is then signed in, and a session that was there before a sign-in never survives it. The connections of the replaced session close (below).
- **Two lifetimes** (OWASP asks for both): an **absolute** one of **30 days** from the sign-in, however much the session is used, and an **idle** one of **7 days** without use. The absolute one bounds a stolen token that is kept alive by using it; the idle one ends a session that was left behind (a shared computer) without waiting a month. Seven days is a working week and a weekend: a person who comes back on Monday does not sign in again, and a session nobody touched for a week is not wanted. Both are constants in `sessionPolicy` and say why next to their values.
- **`last_seen_at` is written at most once every 5 minutes** per session, and never by two requests at once (the condition is repeated in the `UPDATE`). A request inside the interval only reads. Five minutes is 1/2000 of the idle window, so the idle expiry is exact to within five minutes of a week, and an active person costs one write per five minutes. It is a column of `0008` with its index: the sweep below finds the idle sessions by it, and measured on 100,000 sessions the sweep takes 0.1 ms with the index and 26 ms without it. The index has a price: an indexed column cannot be updated heap-only, which the five minutes bounds.
- **Expiry reaches the sockets.** A request of a session that has ended is refused when the session is read, so no sweep is needed for REST. A WebSocket that is already open is never read again, so a **sweep every minute** removes the sessions that ended and closes their connections with `4401` (protocol §6.3), the same call sign-out makes. A socket outlives its session by at most a minute. Traffic over the WebSocket does not count as use: a person who edits for a week without one REST request would be signed out at the end of the idle window. The screens read through REST all the time, so this is accepted rather than writing `last_seen_at` from the collaboration server.

### The cookies

| Cookie | `HttpOnly` | `SameSite` | `Secure` | Holds |
| --- | --- | --- | --- | --- |
| `dr_session` | yes | `Lax` | in production | the session token |
| `dr_csrf` | no, the page reads it | `Lax` | in production | the CSRF token |

Both on path `/`, ending with the session's absolute lifetime. `Secure` is set when `NODE_ENV` is `production` and not otherwise: a development server is plain HTTP, and a browser would never send a `Secure` cookie back to it. Clearing them at sign-out repeats the attributes, which a browser needs to match them. `@fastify/cookie` sets them; the `Cookie` header is **read by the server's own parser** (`cookies.ts`), because `@fastify/cookie` only parses once its plugin is registered and the collaboration server calls the provider with the headers of a WebSocket upgrade that no Fastify plugin has seen. The first of two cookies with the same name wins, and the parser has no prototype, so a cookie named `__proto__` is just a cookie.

### CSRF: double submit, signed to the session

The `dr_csrf` cookie is repeated in `X-CSRF-Token` on every method that changes something (the contract says which, by `security`). The token is the **HMAC-SHA256 of the session token under the server's secret**, and the server requires the header to equal the cookie **and** to equal what it computes for this session, in constant time. A plain double submit (any two equal values) would let someone who can plant a cookie for the site, such as a sibling subdomain, choose both. A missing or wrong token is `403 csrf`, and the session is checked first (`401`), the order of ADR 0010. A test walks every operation of the contract that changes something, so one added later without the check is caught.

A consequence: the secret is `SESSION_SECRET`, required in production and random per process otherwise. A development server that restarts with no `SESSION_SECRET` set keeps its sessions (they are in the database) but its CSRF tokens no longer verify, until the person signs in again. Set `SESSION_SECRET` in the `.env` of a development checkout to avoid it.

### The limit on attempts

`@fastify/rate-limit` with its in-memory store, asked by the routes (not as a hook), because it has to count **failures** and not requests:

| What | Limit | Window |
| --- | --- | --- |
| Failed sign-ins for one address of email (case and Unicode form folded) | 10 | 15 minutes |
| Failed sign-ins from one network address, whatever the accounts | 30 | 15 minutes |
| Sign-ups from one network address (every attempt, `409` included) | 10 | 1 hour |

Why these figures: ten wrong passwords for one account in a quarter of an hour is far more than a person who forgot theirs types, and an attacker held to it makes one guess every 90 seconds, about three years for a million guesses. Thirty from one address allows a household or an office with a few forgetful people and stops one machine that tries many accounts. Ten accounts an hour from one address is a team signing up together and not a script.

- **Successful sign-ins do not count**, so using the account never uses up what is left for a person who is guessing. A blocked address is refused **before** the password is checked, so the limit is not an oracle: the right password does not get in during the window.
- **An address with no account counts as one that has**, so the limit says nothing about who has an account, and the refusal is the same `429` with `Retry-After`.
- **What it costs.** Whoever can send ten wrong passwords for an address can keep its owner out for a quarter of an hour (a lockout is a denial of service that is cheap). Per email *and* IP would stop that and let a botnet with many addresses guess freely. The window is short and the owner is not locked out for good.
- **Single instance.** The store is the process's memory: the counts are right for one instance and each of several behind a balancer would count alone. A shared store is a change of the plugin's `store` option and nothing else here. Behind a reverse proxy the address is the proxy's until `trustProxy` is set: **that, and the shared store, are for T7.2 and T8.1**.
- The check comes after the shape of the request (ADR 0010: the shape is checked before anything about a resource), so a request that is not valid is a `400` and is not counted.

### Sign-up and invitations

`signUp` creates the account and the session, and answers `201` with the person. If the address already has a signed-up account it is `409 conflict` and nothing changes. If it had been added to workspaces by email, the row that invitation made **is claimed**: same `userId`, so the memberships and document grants given to the address are the person's from that moment (ADR 0005). A concurrent pair of sign-ups for one address is one `201` and one `409` (the second finds the unique index taken). A person with no invitation belongs to **no workspace**: the contract has no operation that creates one, and the app already shows that state.

### Collaboration

The upgrade of the WebSocket resolves the session from the **`Cookie` header of the upgrade request, and from nothing else**: not the address, not an `Authorization` header, not the token of the first Hocuspocus message. A test sends the session in each of those and is refused every time. The connection context carries only a keyed hash of the session id (protocol §3.3), which is how a session that ends finds its connections: **sign-out, a new sign-in in its place and expiry all end with the same call, `endConnections`, after the change is committed** (ADR 0012), and a connection being opened at that moment is caught by the marks of ADR 0011. No CSRF token is asked of an upgrade (a browser cannot add a header to one); the `Origin` check of the protocol and `SameSite=Lax` stand in.

### The development identity

`X-Dev-User` still works only in `development` and `test`, behind the cookie: a request with a valid session is the person of the session, and with none it is the person the header names. A request that has a session is checked like any other, so the header is never a way around its CSRF token. The production guard of the build is T7.2's.

## The four questions of the contract

1. **`409` on sign-up reveals which emails have an account: accepted.** The contract fixes the answer, and the alternative (always `201` and a message to the inbox) needs email delivery, which the MVP does not have. What limits it is the sign-up limit above (ten attempts an hour from an address). Sign-in, where guessing is the point, never says. Revisit with email verification.
2. **Password normalisation: NFKC**, above.
3. **Email verification: none, and that is a known gap.** Without it, whoever signs up first with an address that has a pending invitation inherits its grants, and anyone can sign up as an address they do not own. The invitation is made by a member, so the exposure is bounded to the documents shared with that address, but it is real. It needs email delivery and is **a pending decision for the owner** before the app is public.
4. **The CSRF exemption of sign-in (login CSRF): kept, and made safe by the content type.** A cross-site form can post to the address, but it can only send `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain`, none of which the server reads as JSON (a test sends the first and the last and gets `400`); sending JSON needs a preflight the server never grants (T7.2 sets CORS by `ALLOWED_ORIGINS` and **must not** allow credentials from any other). `SameSite=Lax` does not help here, since the attack sends no cookie of its own.

## Threats covered

| Threat | How | Tests |
| --- | --- | --- |
| Session fixation | A new token on every sign-in and sign-up; the presented one ends; a client-chosen token is never accepted | `auth/session.test.ts` |
| Stolen database | Only the SHA-256 of the token; passwords as Argon2id | `auth/sessions.test.ts`, `passwords.test.ts` |
| CSRF | Signed double submit on every operation that changes something | `auth/csrf.test.ts` (one row per operation), `csrf.test.ts` |
| Login CSRF | JSON only | `auth/sign-in.test.ts` |
| Brute force | Failure limits per account and per address, before the password is checked | `auth/rate-limit.test.ts` |
| Account enumeration | The same `401` for all three kinds of failure, and the same work; the limit counts unknown addresses | `auth/sign-in.test.ts`, `rate-limit.test.ts` |
| Timing | A check against a hash nobody knows; constant-time comparisons | `passwords.test.ts`, `auth/sign-in.test.ts` |
| Session after sign-out, over REST and WebSocket | The row is deleted; connections close with `4401`; the cookie is refused afterwards | `auth/session.test.ts`, `collab/session-auth.test.ts` |
| Session that expires with a socket open | The sweep | `sessionSweep.test.ts`, `collab/session-auth.test.ts` |
| Token in the address or a header of the WebSocket | Only the cookie is read | `collab/session-auth.test.ts` |
| Cookie theft by a script, or sent in the clear | `HttpOnly`, `Secure` in production, `SameSite=Lax` | `auth/session.test.ts` |
| Secrets in logs | Nothing logs a body or a token; a test searches the output | `auth/logs.test.ts` |
| Development identity in production | The cookie provider alone in `production` and when `NODE_ENV` is not set | `session.test.ts`, `select.test.ts` |
| The whole thing in a browser, against the real server | Sign-in, gate, sign-up and sign-out with a live socket in another tab | `e2e-collab/auth.spec.ts`, `identity.spec.ts` |

## The real-stack end-to-end suite

ADR 0015 identified a browser by a test cookie that a proxy turned into `X-Dev-User`, because there was no session. It is replaced: each browser context **signs in** as an account of the demo seed (which now has the demo password, the one the mock's accounts have) through the origin of the app, and is its session cookie from then on, for REST and for the collaboration socket. The suite has its own screens test (sign in and back to the page, sign-up, sign-out that ends the session and makes the **server** close a live socket held by another tab). Setting a scene up from Node still uses the development header against the API, since there is no browser there to hold a session.

What stays of the proxy of the Vite servers is **routing and nothing else**: it serves `/api` and `/collab` from the origin of the app, as a reverse proxy does in production, and rewrites no request. It cannot go yet: the server has no CORS until T7.2, so a page on one port cannot read answers from another. When T7.2 adds it, the suite can talk to the API directly and the proxy can go.

## What is left, and for whom

- **T7.2:** the production build guard against `X-Dev-User`, security headers and CSP, CORS by `ALLOWED_ORIGINS` (never with credentials for another origin), body and message limits, rate limits for the rest of REST and for WebSocket messages, `trustProxy`.
- **T8.1:** a shared rate-limit store if there is more than one instance; HTTPS and HSTS at the proxy, without which `Secure` cookies are never sent.
- **Not in the contract, so not here:** changing a password, signing out everywhere, listing sessions, recovering an account, verifying an email, throttling by device. Each is its own task and, but for the first, needs email delivery.
- **Rehashing** when the Argon2id parameters are raised.

## Consequences

- A person who signs in on a second device has two sessions; each ends alone.
- The session secret now matters: it keys the CSRF tokens, and a restart with a new one invalidates every CSRF cookie (not the sessions).
- The server writes to `sessions` on sign-in, sign-up, sign-out, and once every five minutes of use.
- The cookie provider is called by the collaboration server with headers only, so it does not rely on a Fastify plugin having run.

## Alternatives considered

- **JWT in a cookie or in `localStorage`:** a token that cannot be revoked until it expires, which is what sign-out and closing sockets need. `localStorage` is readable by any script. Rejected for server-side sessions.
- **A plain double submit, or the synchroniser token stored per session in the database:** the first is forgeable by a cookie planted from a sibling domain; the second needs a column and a read of it on each request. The HMAC has neither problem and no state.
- **`@fastify/session`:** it stores whole sessions and signs the cookie, which is more than needed here (the session holds one fact) and takes the token, the expiry and the rotation out of our hands, where tests pin them.
- **bcrypt or scrypt:** Argon2id is what OWASP recommends first and resists GPUs better. **Argon2 with 64 MiB:** stronger, at more than three times the memory per sign-in that a burst would hold at once.
- **Counting every sign-in, not only failures:** simpler (it is the plugin's default) but it spends the allowance of a person who signs in often, and does not tell an attack from use.
- **A limit per email *and* address together:** it stops the cheap lockout of one account and lets a few machines guess freely.
- **Closing sockets by a timer to the earliest expiry (protocol §6.3):** exact, and one more moving part; a sweep every minute is simple and bounds the delay.
