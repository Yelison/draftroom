# Draftroom Implementation Plan

> **For agentic workers:** each task below is executed in its own branch and worktree by one implementer, then reviewed by an independent reviewer before it is merged through a pull request. Read the whole task, the Global Constraints and the Review Focus before you start. Steps use checkbox (`- [ ]`) syntax for tracking. Implementers write their own test-first steps inside each task; this plan fixes the contracts, the files, the tests that must exist and the acceptance criteria.

**Goal:** Build Draftroom, a desktop-first, bilingual (English and Spanish) collaborative document editor with an explorer, a shared editor with live presence, anchored comments, sharing by role and version history, backed by a real Node.js server and PostgreSQL, and published as a static demo with a simulated API.

**Architecture:** A React + TypeScript + Vite client renders Tiptap on top of Yjs. A Node.js + TypeScript server exposes a contract-first REST API (Fastify) and a Hocuspocus WebSocket server for collaboration in the same process, on two ports, sharing one PostgreSQL database. PostgreSQL holds metadata, permissions, comments, versions and the binary Yjs state of every document. The client talks to the server through one data-source interface with two implementations: HTTP + WebSocket against the real server, and an in-browser simulation used by the e2e suite and the public demo.

**Tech Stack (versions verified on 2026-10-13 against the npm registry and official docs):** Node.js 24 LTS (`.nvmrc` `24`); TypeScript 6.0.3; React 19.3.0; Vite 8.3.4 with `@vitejs/plugin-react` 6.1.2; Vitest 5.0.4; Playwright 1.64.0; Tiptap 3.31.4 for every `@tiptap/*` package; Yjs 13.6.33 with `@tiptap/y-tiptap`; `@hocuspocus/server` and `@hocuspocus/provider` 4.7.1; Fastify 5.12.7; Kysely 0.29.6 with `pg` 8.23.1; Zod 4.6.7; `openapi-typescript` 7.13.0 with `openapi-fetch`; `react-intl` (FormatJS); `y-indexeddb` 9.0.12; `@node-rs/argon2` 2.2.2; Testcontainers 12.2.1; `@yelison/forma-ui` 0.3.0.

**Spec:** the product requirements this plan argues from are stated in §1.3, §1.4 and §2 (screens, routes, components, states and acceptance criteria), and the collaboration and validation requirements in §4, §5 and §9.

## How to read this plan

- **[existing]** marks something verified in the repository or a dependency; **[proposed]** marks a decision this plan makes. Nothing marked [proposed] exists yet.
- Every contract in §4 is normative: a task that needs to change it stops and asks (contract changes have a single owner, §8.2).
- Repository documentation, code, commits and plans are in English. The product UI is in English and Spanish.

## Global Constraints

- Node.js `>=24.0.0 <25` (`engines` and `.nvmrc` `24`); revisit Node 26 when it becomes Active LTS (2026-10-28) in its own task.
- TypeScript `6.0.3` pinned (TypeScript 7 is outside `openapi-typescript` 7.13's peer range); `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- Every `@tiptap/*` package pinned to exactly `3.31.4` (`@tiptap/react` 3.31.4 peers `@tiptap/core` 3.31.4 exactly). Never install `@tiptap-pro/*` (paid licence, private registry). Never mix `y-prosemirror` with Tiptap v3: use `@tiptap/y-tiptap`.
- `@yelison/forma-ui` pinned to exactly `0.3.0`. Draftroom never redefines a Forma UI token; product tokens live in their own file (§3.6). Missing generic components or tokens are requested from Forma UI, not built ad hoc.
- Desktop only, no mobile: build and verify from 1280 px; below 1280 px show the desktop requirement screen. Keyboard, focus, zoom to 200 % and screen-reader obligations still apply.
- Bilingual: every visible string, `aria-label`, title, live-region announcement and error message exists in English and Spanish, added together, with ICU plurals and `Intl` for dates and numbers. No sentence built by concatenation. User content is never translated.
- No visible text in a developer voice: no "coming soon", no data provenance, no explanations of how to read a screen. Those go in docs and reports.
- Never call local-only state "saved" or "synced": "Synced" means the server stored the change durably (§5.2).
- Read-only UI is not a permission barrier: every permission is enforced on the server, for REST and for WebSocket, and tested on both.
- Never rebuild a Yjs document from JSON on reconnect; the binary Yjs state is the source of truth for content.
- Default deny: an operation not explicitly granted by §4.3 is refused.
- Commits: Conventional Commits in English, each with the `Co-Authored-By` trailer; pull requests are squash-merged unless the task says otherwise.
- No new dependency outside a task's "Dependencies added" list; one task at a time owns `package-lock.json` (§8.2).
- Each new test must fail without its change; the delivery shows the mutation that proves it.
- Never weaken CI to get green; no arbitrary coverage threshold.

## Review Focus

These are the inputs no single task's happy path exercises and the ones most likely to hurt a person using Draftroom. Each line names the task whose tests pin it.

1. **Two people type in the same paragraph while one of them drops offline and reconnects**: the document converges with no duplicated or lost text, and neither client shows "Synced" before the server stored the merge. Pinned in T2.4 (two-context e2e with `context.setOffline`) and T2.2 (sync-state machine unit tests).
2. **A viewer or commenter sends a hand-crafted Yjs update over the WebSocket**: the server rejects it, does not apply, persist or broadcast it, and other clients never see it. Pinned in T2.1 (raw WebSocket client test) and T4.1 (access matrix over WebSocket).
3. **The commented text is deleted or rewritten by another user**: the thread shows as orphaned with its original quote, no highlight lands on unrelated text, and replying or resolving still works. Pinned in T3.2 (anchor resolution unit tests with remote deletions) and T3.1 (server keeps the thread).
4. **Access is revoked while the person has the document open with unsynced offline edits**: the live connection closes, the local edits are not uploaded later, the offline copy is purged, and the screen says access was removed. Pinned in T4.1 (connection close on revoke) and T2.3 (no upload after a failed re-authentication).
5. **The owner restores a version while others are editing**: the result is defined (the restore is one transaction on the live document, edits after it apply on top), a pre-restore version is created automatically, and nothing is silently lost. Pinned in T5.1 (concurrent restore integration test).

---

## 1. Diagnosis

### 1.1 Repository [existing]

Reviewed commit: `3ed163a` on `main` of `github.com/Yelison/draftroom` (2026-10-13). It contains `README.md`, `LICENSE` (MIT) and `.gitignore`. Nothing is implemented: no package manifest, no lockfile, no CI, no source code. `main` is protected by the ruleset "Protect main": pull request required, linear history, no force push and no deletion; required status checks are added once the CI jobs of T0.1, T0.4, T0.7 and T2.4 exist (§9.1).

| Area | Status | Evidence |
| --- | --- | --- |
| Frontend, editor, server, database, CI | pending | no files at `3ed163a` |
| Contracts (REST, collaboration protocol) | pending | this plan defines them (§4, §5); T0.2 and T0.3 write them |
| UI specification | defined here | screens, routes and components in §1.3, UI decisions in §1.4, states in §2.3 |
| Product tokens | pending | only the generated token file enters this repository (T0.8) |
| Deployment | decided, pending | real backend packaged for deployment; public demo is static with a simulated API (§10) |

### 1.2 Forma UI 0.3.0 [existing]

Verified from the published tarball: MIT, ESM, `sideEffects: ["*.css"]`, `engines.node >=22.12`, peers `react`/`react-dom` `^19.2`, no runtime dependencies. Exports `./`, `./base.css`, `./styles.css`, `./tokens.css`, `./tokens.json`, `./contrast-pairs.json`.

- Components: `Button` (variants, `icon`, `loading`, `loadingLabel`), `IconButton` (`icon`, required `label`), `Icon` + `iconNames`, `Badge` (`tone` blue/green/amber/red/neutral), `Field`, `Input`, `Radio`, `Tabs` (ARIA tabs, automatic activation), `Tooltip`, `Dialog`/`Modal` (native `<dialog>`, `size`, `presentation`).
- Theme: `createThemeStore({ storageKey, attribute })`, `useTheme`, `themeScript` (inline head script); dark theme by `data-theme` on `<html>` plus `prefers-color-scheme`, "system" removes the attribute.
- Strings: `FormaProvider strings={…}` with two keys, `buttonLoading` and `dialogClose`; `Dialog` has no built-in close button.
- Tokens: 26 colour tokens per theme (`--color-bg`, `surface`, `surface-hover`, `ink`, `muted`, `line`, `disabled`, `overlay`, `nav*`, `brand`, `brand-hover`, `on-brand`, `link`, `focus`, `progress-track`, `{blue,green,amber,red}-{bg,ink}`), typography shorthands (`--font-caption`, `body`, `label`, `strong`, `section`, `title`…), spacing `--space-0…64`, radii, control sizes, motion, z-index.
- Not provided and needed by Draftroom (to request from Forma UI): Avatar, Menu/Popover, Select or Listbox, Toast, Checkbox or Switch, Skeleton, Table styles. Draftroom-specific pieces stay in Draftroom: Presence, SyncStatus, DocumentRow, CommentCard, Permission.

### 1.3 Screens, routes and components [proposed]

Desktop layout at 1440 × 900: rail 88 px, explorer 272 px, work area 1080 px; header 64, toolbar 56, footer 40; document sheet 708 × 716 with a 48 px reading margin; collaboration panel 328 × 716. Overview screens use a 208 px rail with icon and label.

| Area | Content | Route |
| --- | --- | --- |
| Home | pinned documents with excerpts, recent activity | `/` |
| Documents | groups of document and folder cards | `/documents` |
| Team folders | the documents of a team folder | `/folders/:folderId` |
| Document editor | explorer, toolbar, document sheet, comments and activity panel | `/documents/:documentId` |
| New document | create then open | `/documents/new` → redirect |
| Share | sharing panel over the editor | `/documents/:documentId/share` (dialog route) |
| Document versions | version list, preview, restore | `/documents/:documentId/versions` |
| Templates | built-in templates | `/templates/:templateId` |
| Shared with me | table with owner, permission, activity, preview | `/shared` (`?access=&selected=`) |
| Workspace history | timeline across documents | `/history` (`?document=&person=&range=`) |
| Settings | Profile, Workspace, Members, Appearance | `/settings/profile` (default), `/workspace`, `/members`, `/appearance` |
| Trash, search results | archived documents; results of a search | `/trash`, `/search?q=` |

Product components and their variants: Button (from Forma UI); Presence (Online, Away, Offline); SyncStatus (Synced, Synchronising, Offline with local copy, Reconnecting, Error, Read-only); DocumentRow (Default, Selected, Focus, Archived, Folder); CommentCard (Open, Resolved, Orphaned); Permission (Viewer, Commenter, Editor, Owner). Typography scale: Caption 12/17, Body 14/20, Label 14/20 medium, Strong 14/20 semibold, Section 17/24, Title 30/42, DocumentBody 16/24, DocTitle 38/48, DocHeading 23/32 (Inter). Icons: 24 px grid, 1.7 px stroke, from Forma UI where it has them.

### 1.4 UI decisions [proposed]

| # | Decision |
| --- | --- |
| D1 | Every mandatory state (initial load, empty, document not found, access denied, reconnecting, access revoked) has its own screen state, built from the product components and tokens and shown in screenshots in each delivery |
| D2 | The editor header shows the SyncStatus state; a local copy is never labelled "Saved" (§5.2) |
| D3 | Viewer: no formatting toolbar and no comment actions; commenter: comment actions only |
| D4 | SyncStatus includes Reconnecting (amber) and Read-only, each with its own strings |
| D5 | Presence, Permission (all four roles), avatars, tags and radio choices are real components, never text stand-ins |
| D6 | "Version history" (one document) and "Workspace history" (all documents) are distinct terms in both languages; each rail label matches its page title |
| D7 | `/settings` opens Profile; inviting a member is a workspace dialog in Members, separate from document sharing |
| D8 | 1280–1440 px behaviour (T6.5): the document width adapts, explorer and comments keep useful widths, the comments panel can be closed and reopened |
| D9 | Spacing, radii and control heights come from Forma UI tokens; product-only values live in the product token layer (T0.8) |
| D10 | A product colour that differs from a Forma UI token is never resolved silently: either Forma UI's value is adopted or a change is requested from Forma UI (Q3) |
| D11 | Demo and seed content reads as real user content; no developer-voice or filler text |
| D12 | Rename, trash, restore confirmation, invite dialog, search results and collaborator carets are built with Forma UI Dialog and the existing patterns; each task lists them |

### 1.5 Verified facts that shape the architecture [existing]

- Hocuspocus 4.7.1 acknowledges an update (`SyncStatus(true)`, `unsyncedChanges` reaching 0) once it is applied to the in-memory document, **not** once it is stored. Nothing tells the client about a database write. A durable acknowledgement must be built (§5.2) with `afterStoreDocument` and a stateless broadcast.
- Hocuspocus 4.7.1 marks a connection read-only with `data.connectionConfig.readOnly = true` inside `onAuthenticate` (the published source; the docs page says `connection.readOnly`). T2.1 pins the real field with a test.
- Read-only connections get `SyncStatus(false)` for every update they send, so `hasUnsyncedChanges` never returns to false for viewers; the client must not show "unsynced" for them.
- `Y.createDocFromSnapshot` requires `gc: false`; Hocuspocus defaults to `gc: true`. Versions are stored as independent `Y.encodeStateAsUpdate` blobs instead of Yjs snapshots (§5.5).
- Tiptap v3: `StarterKit.configure({ undoRedo: false })` with Collaboration; the collaboration undo manager tracks only the local sync origin, so undo never reverts remote edits. `CollaborationCaret` replaces `CollaborationCursor`.
- Comments and Snapshot are paid Tiptap extensions; Draftroom builds its own comments and versions on MIT Yjs and Tiptap.
- `ws` defaults to a 100 MB maximum message size; Draftroom sets `maxPayload` explicitly.

## 2. Scope

### 2.1 MVP

Explorer with search and recent documents; create (blank or from template), rename, move to folder, archive and restore, permanently delete; editor with title, paragraphs, headings, bulleted and numbered lists, links, bold, italic and code; live presence and carets; anchored comments with replies, resolve and reopen; sharing with workspace members by explicit role; workspace history and document version history with preview and confirmed restore; home with pinned documents and recent activity; settings for profile, workspace, members and appearance (light, dark, system); English and Spanish; email-and-password accounts (pending Q1).

### 2.2 Deferred (needs an explicit decision to enter)

Attachments and images, tables, AI features, anonymous or public links, export beyond copying text, notifications and email delivery, mobile, multiple workspaces in the UI (the data model supports them), comment re-anchoring, offline editing of documents never opened before, real-time explorer updates across users (the explorer refetches on focus and after mutations).

### 2.3 Acceptance criteria by screen and state

Every screen is accepted in light and dark, in English and Spanish, at 1280 and 1440 px and at 200 % zoom, keyboard-only, with no horizontal scroll and no axe violations.

| Screen | States that must exist and be tested |
| --- | --- |
| Home | loading skeleton without layout shift; no pinned documents (empty with "New document"); pinned list; activity empty; error with retry |
| Documents and folders | loading; empty workspace; list; search with no results; archived document hidden; error with retry |
| Editor | initial load; not found; access denied; viewer (no toolbar, no comment actions); commenter; editor; synchronising; synced (durable); offline with local copy; reconnecting; recoverable error; access revoked; document archived while open |
| Comments panel | no comments; open; resolved (filtered); orphaned; reply failed; read-only (viewer) |
| Share dialog | loading; members list; adding; role change; removal; last-owner protection; error |
| Shared with me | loading; empty; filtered empty; list with preview |
| Workspace history | loading; empty; filtered empty; paginated list; event of a document no longer accessible (hidden) |
| Version history | loading; no versions; list; preview; restore confirmation; restore in progress; restore failed; not allowed (non-owner sees list and preview without restore) |
| Settings | each tab with save success, validation error and server error; members: invite, role change, removal, last-owner protection |
| Below 1280 px | desktop requirement screen with the content still reachable by zooming out |

## 3. Architecture

### 3.1 Repository layout [proposed]

npm workspaces, one lockfile at the root.

```
apps/web/            React client (Vite)
  src/app/           providers, router, route table, layouts, desktop guard
  src/features/<x>/  one folder per product area: explorer, editor, comments, sharing, versions, history, home, settings, auth
  src/data/          DataSource interface, http/ and mock/ implementations, query keys
  src/collab/        provider factory, sync-state machine, offline cache, awareness
  src/i18n/          locale resolution, catalogues en.json/es.json, pseudo-locale
  src/styles/        forma-tokens.css (synced copy), draftroom-tokens.css (product layer), global.css
  e2e/               Playwright specs against the mock data source
  e2e-collab/        Playwright specs against the real stack (two browser contexts)
apps/server/         Node server
  src/http/          Fastify app, routes per area, auth hooks, problem+json errors, contract validation
  src/collab/        Hocuspocus instance, authentication, persistence, durable ack, revocation
  src/domain/        permissions, documents, comments, versions, activity (pure logic, no I/O)
  src/db/            Kysely instance, generated table types, migrations/, demo-seed/
  test/              integration tests (Testcontainers), contract and access-matrix harnesses
packages/contract/   openapi.yaml, generated TypeScript types, collaboration message schemas (Zod), shared constants
packages/editor-schema/  the Tiptap extension list shared by client and server, and the ProseMirror JSON <-> Yjs conversion
                     helpers (`@tiptap/y-tiptap`) the server needs to write content (templates, restore)
docs/                api/README.md, collab/protocol.md, decisions/ (ADRs), development/, deploy/, plans/
```

### 3.2 Client

React 19 with React Router (data routes), TanStack Query for server state (query keys in one module, mutations invalidate by key), Tiptap 3.31.4 with Collaboration and CollaborationCaret over a `HocuspocusProvider`, `react-intl` for i18n. Forma UI components are imported from `@yelison/forma-ui`; product components live in `features/*/components` or `src/components` when shared (Presence, SyncStatus, DocumentRow, CommentCard, Permission, Avatar until Forma UI provides one).

### 3.3 Server

One Node process with two listeners:

- **REST** (Fastify 5) on `API_PORT`: JSON over HTTP, `application/problem+json` errors with a stable `code`, request and response validation from `packages/contract/openapi.yaml` (ajv, compiled once at start-up, one source for both).
- **Collaboration** (Hocuspocus 4.7.1 `Server`) on `COLLAB_PORT`: WebSocket, authenticated from the same session cookie (§4.1). A separate listener is the documented, simplest mode and keeps Hocuspocus hooks (`onRequest`, `onUpgrade`) working; behind a reverse proxy both live under one origin (`/api`, `/collab`).

Database access through Kysely with `pg`; migrations with Kysely's `Migrator` (one tool, TypeScript migrations, forward-only, each tested on an empty and a populated database). Alternatives considered: Drizzle (1.0 still a release candidate), Prisma (heavy runtime, binary engine, weaker fit for `bytea` streaming), Hono (fine, but Fastify's `inject()` and schema hooks suit contract tests; Hono stays an option if Fastify blocks).

### 3.4 Authentication [proposed, pending Q1]

Default: email and password accounts with Argon2id (`@node-rs/argon2`), server-side sessions in PostgreSQL, an `HttpOnly`, `SameSite=Lax`, `Secure` cookie rotated at sign-in, CSRF double-submit (`dr_csrf` cookie echoed in `X-CSRF-Token` on unsafe methods), login rate limiting. The WebSocket upgrade carries the same cookie; `onAuthenticate` resolves the session, never a token passed in the URL. Development and the mocked e2e use a development identity header (`X-Dev-User`) accepted only when `NODE_ENV=development` or `test` and compiled out of production builds (guard test in T7.2). Authentication sits behind an `AuthProvider` boundary so OIDC (as in Resolve) can be added without touching routes.

### 3.5 Internationalisation

`react-intl` with ICU messages in `apps/web/src/i18n/en.json` and `es.json`, precompiled at build time. URLs and slugs are English and identical in both languages; the language is resolved as stored preference → browser → English, applied before first paint by an inline head script that also sets `<html lang>`. `check:messages` fails if the catalogues differ in keys or arguments. A pseudo-locale build (`en-XA`) is used by e2e to catch untranslated strings and overflow. The server never returns translated text: errors carry a stable `code` that the client maps to messages. Built-in templates are localised product content; user documents are never translated. Forma UI's two internal strings are passed through `FormaProvider`.

### 3.6 Tokens

`apps/web/src/styles/forma-tokens.css` is a byte-for-byte copy of the package's `tokens.css`, regenerated by `npm run sync:forma-tokens` and checked by a test (pattern from Resolve). `draftroom-tokens.css` holds product-only tokens (editor typography: DocTitle, DocHeading, DocumentBody; layout widths: rail, explorer, sheet, panel; presence colours), generated from the product token source decided in T0.8 and checked by a test that it redeclares no Forma UI token. Theme switching uses Forma UI's `createThemeStore` and `themeScript`.

### 3.7 Data-source boundary (mock and real)

All client data access goes through `DataSource` (`apps/web/src/data/DataSource.ts`): typed REST operations generated from the contract plus `openDocument(documentId): CollabSession`. `HttpDataSource` uses `openapi-fetch` and `HocuspocusProvider`; `MockDataSource` serves the same operations from in-memory fixtures and runs collaboration on a local `Y.Doc` shared across tabs with `BroadcastChannel`, plus a scripted collaborator for the demo. The implementation is chosen at build time by `VITE_DATA_SOURCE=http|mock` (with `VITE_API_URL` and `VITE_COLLAB_URL` for `http`). One contract test suite (`apps/web/src/data/contract.suite.ts`) runs against both: the mock in unit tests, the real server in CI (T2.4). A production-bundle test fails if any mock module or fixture string reaches a `http` build.

### 3.8 Sources checked

Versions: `npm view <package> version dist-tags engines peerDependencies license` on 2026-10-13; Node.js release schedule (github.com/nodejs/Release, `schedule.json`). APIs: Tiptap StarterKit, Collaboration and CollaborationCaret docs and the v2→v3 upgrade guide (tiptap.dev/docs); Tiptap Pro extensions and pricing (tiptap.dev/pricing, tiptap.dev/docs/guides/pro-extensions); Hocuspocus hooks, configuration, Database extension, provider events and framework examples (tiptap.dev/docs/hocuspocus), cross-checked against the published 4.7.1 source (`packages/server/src/types.ts`, `ClientConnection.ts`, `MessageReceiver.ts`); Yjs relative positions, document updates, Y.Doc and awareness (docs.yjs.dev), `Snapshot.js` in the Yjs source; `@tiptap/y-tiptap` `yUndoPlugin.ts`; the published `@yelison/forma-ui@0.3.0` tarball. Re-verify versions when a task starts; a newer patch is fine, a newer minor or major needs its own task.

## 4. Contracts

### 4.1 REST API (owner: T0.2; file `packages/contract/openapi.yaml`)

Base path `/api`. Cookie session. Unsafe methods require `X-CSRF-Token`. Every 4xx/5xx is `application/problem+json` with `type`, `title`, `status`, `code` and optional `errors[]` for validation.

| Area | Operations |
| --- | --- |
| Session | `GET /api/me`; `POST /api/auth/sign-up`; `POST /api/auth/sign-in`; `POST /api/auth/sign-out` |
| Workspaces | `GET /api/workspaces`; `GET /api/workspaces/{workspaceId}`; `PATCH /api/workspaces/{workspaceId}` |
| Members | `GET /api/workspaces/{workspaceId}/members`; `POST …/members` (add by email, pending until that email signs up); `PATCH …/members/{userId}`; `DELETE …/members/{userId}` |
| Folders | `GET /api/workspaces/{workspaceId}/folders`; `POST …/folders`; `PATCH /api/folders/{folderId}`; `DELETE /api/folders/{folderId}` (only empty) |
| Documents | `GET /api/workspaces/{workspaceId}/documents?query&folderId&archived&cursor&limit`; `POST …/documents` (`title`, `folderId?`, `templateId?`); `GET /api/documents/{documentId}`; `PATCH /api/documents/{documentId}` (`title?`, `folderId?`, `revision`); `POST /api/documents/{documentId}/archive`; `POST /api/documents/{documentId}/restore`; `DELETE /api/documents/{documentId}` (archived only) |
| Pins and shared | `PUT`/`DELETE /api/documents/{documentId}/pin`; `GET /api/workspaces/{workspaceId}/pinned`; `GET /api/workspaces/{workspaceId}/shared?access=edit|comment|view` |
| Access | `GET /api/documents/{documentId}/access`; `PUT /api/documents/{documentId}/access/{userId}` (`role`); `DELETE /api/documents/{documentId}/access/{userId}`; `PUT /api/documents/{documentId}/general-access` (`none|viewer|commenter|editor`) |
| Comments | `GET /api/documents/{documentId}/threads?status=open|resolved`; `POST /api/documents/{documentId}/threads` (`anchor`, `quote`, `body`); `POST /api/threads/{threadId}/replies`; `POST /api/threads/{threadId}/resolve`; `POST /api/threads/{threadId}/reopen`; `PATCH`/`DELETE /api/comments/{commentId}` |
| Versions | `GET /api/documents/{documentId}/versions?cursor`; `POST /api/documents/{documentId}/versions` (`label?`); `GET /api/versions/{versionId}/content` (`application/octet-stream`, a Yjs update); `POST /api/versions/{versionId}/restore` |
| Activity | `GET /api/workspaces/{workspaceId}/activity?documentId&actorId&from&to&cursor`; `GET /api/documents/{documentId}/activity?cursor` |
| Templates | `GET /api/templates?locale=en|es` |
| Health | `GET /api/health/live`; `GET /api/health/ready` (database reachable, migrations current) |

Rules:

- **Not found vs forbidden:** a document, thread or version the caller cannot read returns `404 not-found`, identical to a missing one, so ids cannot be probed across workspaces. A readable resource with a forbidden operation returns `403 forbidden`.
- **Pagination:** cursor-based, `limit` default 25, maximum 100, opaque cursor over `(sort key, id)`; responses carry `nextCursor` or `null`. Stable order: `updatedAt desc, id desc` for lists, `createdAt desc, id desc` for activity.
- **Optimistic concurrency:** documents and folders carry an integer `revision`; a stale `PATCH` returns `409 revision-conflict` with the current resource.
- **Limits:** title 1–200 characters, comment body 1–5 000, quote ≤ 500, folder name 1–80; `413 too-large` beyond them.
- **Error codes (initial set):** `validation-failed`, `not-found`, `forbidden`, `unauthenticated`, `csrf`, `revision-conflict`, `last-owner`, `rate-limited`, `too-large`, `conflict`.
- **Cache and invalidation (client):** query keys in `apps/web/src/data/queryKeys.ts`; each mutation lists the keys it invalidates; document-level changes made by others (title, access, comments, versions) arrive as collaboration stateless events (§5.3) and invalidate the matching keys; workspace lists refetch on window focus.

### 4.2 Source of truth per datum

| Datum | Source of truth | Notes |
| --- | --- | --- |
| Document content | binary Yjs state in `document_states.state` (`bytea`) | never rebuilt from JSON; only Hocuspocus writes it |
| Title, folder, archived flag, pins | PostgreSQL `documents` | edited through REST; shown in the editor as a separate title field outside the Yjs document |
| Comments and replies | PostgreSQL `threads`, `comments` | anchors are encoded Yjs relative positions (§5.4) |
| Permissions | PostgreSQL `memberships`, `document_access`, `documents.general_access` | evaluated on every REST request and on every WebSocket authentication |
| Presence and carets | Yjs awareness | ephemeral, never persisted, never used for authorisation |
| Versions | PostgreSQL `document_versions.state` (`bytea`, a full Yjs update) | §5.5 |
| Workspace history | PostgreSQL `activity_events` | append-only; separate from versions |

### 4.3 Roles and operations [proposed]

Workspace roles: `owner`, `member`. Document roles: `viewer`, `commenter`, `editor`, `owner`.

**Precedence (effective document role):** a workspace owner is `owner` of every document in the workspace; otherwise the effective role is the highest of the person's explicit grant on the document and the document's `general_access` (which applies to every workspace member). A non-member has no role. The document creator gets an explicit `owner` grant. New documents start with `general_access = none` (pending Q4). Archived documents are readable only by their owners (to restore or delete); every other operation on them returns `404`.

| Operation | Viewer | Commenter | Editor | Owner |
| --- | --- | --- | --- | --- |
| Read metadata and content, open over WebSocket (read-only) | ✓ | ✓ | ✓ | ✓ |
| Write content over WebSocket | | | ✓ | ✓ |
| List and read comments | ✓ | ✓ | ✓ | ✓ |
| Create thread, reply, resolve, reopen | | ✓ | ✓ | ✓ |
| Edit or delete own comment | | ✓ | ✓ | ✓ |
| Delete another person's comment | | | | ✓ |
| Rename, move to folder | | | ✓ | ✓ |
| Create a version (manual) | | | ✓ | ✓ |
| List and preview versions | ✓ | ✓ | ✓ | ✓ |
| Restore a version | | | | ✓ |
| Read and change access, general access | | | | ✓ |
| Archive, restore from archive, delete permanently | | | | ✓ |
| Pin (personal) | ✓ | ✓ | ✓ | ✓ |

Workspace operations: members list (any member); add, change role or remove members, rename the workspace (owner); a workspace and a document always keep at least one owner (`409 last-owner`). Creating documents and folders: any member.

## 5. Collaboration and CRDT

### 5.1 Connection protocol (owner: T0.3; file `docs/collab/protocol.md`, schemas in `packages/contract/src/collab.ts`)

- Document name on the wire: `doc:<documentId>`.
- `onAuthenticate`: reads the session cookie from `requestHeaders`, resolves the user, loads the effective role, rejects (throws) when there is none, sets `connectionConfig.readOnly = true` for viewers and commenters, and returns `{ userId, workspaceId, role }` as the connection context.
- `onLoadDocument` loads the stored state only after authentication succeeded (Hocuspocus queues unauthenticated messages; `maxUnauthenticatedQueueSize` stays bounded).
- Limits: `websocketOptions.maxPayload` 2 MiB; documents above 5 MiB of state refuse further writes with a stateless `{ type: "document-too-large" }`; per-connection message rate limit.
- Awareness: a state whose `user.id` differs from the connection's `userId` is dropped and never relayed, so presence cannot be spoofed. The Hocuspocus hook that can filter an awareness message before it is applied (an informational hook is not enough) is verified and pinned by a test in T2.1.
- Close codes: `4401 unauthenticated`, `4403 access-revoked`, `4409 role-changed` (reconnect to get the new mode), `4413 document-too-large`, `4429 rate-limited`.

### 5.2 Durability acknowledgement

The server's in-memory acknowledgement is not "Synced". After every successful database write, `afterStoreDocument` broadcasts a stateless message `{ type: "stored", stateVector: <base64 Y.encodeStateVector of what was written> }`. The client keeps its own client id's clock at the moment of each local change; it shows **Synced** only when the provider has no unsynced changes **and** the last `stored` state vector covers its local clock. States: `connecting`, `synchronising`, `synced`, `offline-local` (changes kept in IndexedDB, not on the server), `reconnecting`, `error` (retry), `revoked`, `read-only` (viewers and commenters, never shown as unsynced). Store settings: Hocuspocus `debounce` 1 000 ms, `maxDebounce` 5 000 ms. A failed store keeps the change unsynced and the client shows `error` after the next timeout, never `synced`.

### 5.3 Stateless events (server → clients of one document)

`stored` (above); `metadata-changed` (`title`, `revision`); `access-changed`; `comments-changed` (`threadId`); `versions-changed`; `document-archived`. Each is a Zod-validated discriminated union in `packages/contract`; the client invalidates the matching query keys. Clients never send stateless messages in the MVP (comments and metadata go through REST).

### 5.4 Comment anchors

A thread anchors to a range `{ start, end }` where each end is a base64 `Y.encodeRelativePosition` created on the client with `absolutePositionToRelativePosition` from `@tiptap/y-tiptap` (start with `assoc = 0`, end with `assoc = -1`), plus the quoted text (≤ 500 characters). Resolution: `relativePositionToAbsolutePosition`; the thread is **orphaned** when either end resolves to `null` or `start >= end`. Orphaned threads stay listed with their quote and remain replyable and resolvable; the highlight is removed. Highlights are ProseMirror decorations computed from resolved anchors, never marks stored in the Yjs document (so commenters, who are read-only on content, can still comment). Re-anchoring is deferred.

### 5.5 Versions and restore

- **Checkpoint:** a version is a full `Y.encodeStateAsUpdate(doc)` stored with `createdBy`, `kind` (`auto|manual|pre-restore|restore`) and `label`. Automatic versions: after a document has been idle for 10 minutes following edits, at most one per 30 minutes, created by the server from the live document. Manual versions: editors and owners.
- **Preview:** the client downloads the update and renders it in a read-only editor on a fresh `Y.Doc`; nothing touches the live document.
- **Restore (owner):** inside the server, under the document's store mutex: (1) create a `pre-restore` version of the current state; (2) load the chosen version into a temporary `Y.Doc`; (3) in one transaction with origin `restore`, replace the live fragment's content with the version's content; (4) create a `restore` version and an activity event. Connected editors receive the change as a normal update; edits sent after the restore apply on top; edits that raced with it merge by CRDT rules and are never discarded silently, because the pre-restore version keeps the previous state. Undo for other users does not revert the restore (different origin).
- Retention: unlimited in the MVP; a per-document cap is a deferred decision.

### 5.6 Offline and reconnection

`y-indexeddb` keeps a local copy per account, workspace and document (`draftroom:<userId>:<workspaceId>:<documentId>`), only for documents the person opened. On reconnect the provider re-authenticates; if authentication fails with `4403` or the role is now read-only, local unsynced changes are **not** uploaded, the copy is purged, and the editor shows `revoked`. Sign-out and account switch purge every local copy of the previous account. Offline is shown as `offline-local`, never as saved.

### 5.7 Undo

`StarterKit.configure({ undoRedo: false })`; Collaboration's undo manager tracks only the local origin, so `Mod-Z` reverts only the person's own edits; restore and remote edits are never undone by another user.

## 6. Phases

1. **Foundations (Phase 0):** tooling, contracts, server and web skeletons, data-source boundary, tokens.
2. **Local editor (Phase 1):** document metadata API with server authorisation from the first multi-user call; editor with a local document; explorer.
3. **Durable collaboration (Phase 2):** Hocuspocus with authentication and persistence, client sync states, offline cache, two-user e2e.
4. **Comments (Phase 3).**
5. **Permissions and sharing (Phase 4):** full matrix, revocation, share dialog, Shared with me.
6. **History (Phase 5):** versions and restore, workspace history.
7. **Remaining desktop screens (Phase 6):** Home, settings, templates, trash, desktop adaptation and accessibility pass.
8. **Authentication and hardening (Phase 7).**
9. **Deployment readiness and demo (Phase 8):** production packaging, backup and restore, static demo, README tour.

Authorisation is enforced on the server from T1.1 using the development identity; real sign-in arrives in T7.1 behind the same boundary.

## 7. Tasks

Every task is expanded into a self-contained brief (files, interfaces, tests, acceptance, effort and escalation conditions) before it is launched; later phases are written shorter here because their details depend on the contracts of Phase 0. Sizes: S (≤ 1 day), M (1–2 days), L (2–4 days). Effort: the reasoning level of the implementer session; reviewers run at high for high tasks and medium otherwise. Lanes: **A** server, **B** client, **C** docs and infrastructure.

### Phase 0 · Foundations

#### T0.1 · Workspace tooling and first CI gate (M, medium, lane C)

**Objective:** a repository where `npm ci`, `npm run lint`, `npm run format:check`, `npm run typecheck` and `npm test` pass on empty packages, with the first required CI job.
**Dependencies:** none. **Owner of:** `package-lock.json`, root configs.
**Files:** create `package.json` (workspaces `apps/*`, `packages/*`, `engines.node`), `.nvmrc`, `.npmrc` (official registry), `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `oxlint` config, `tsconfig.base.json`, `apps/web/package.json`, `apps/server/package.json`, `packages/contract/package.json` (each with an empty typed entry and one smoke test), `.github/workflows/ci.yml` (job **Static checks**), `.github/pull_request_template.md`, `CONTRIBUTING.md`, `.github/dependabot.yml` (npm and actions, grouped minor and patch).
**Dependencies added:** typescript 6.0.3, vitest 5.0.4, oxlint, prettier.
**Tests:** a smoke test per package; the CI job runs on the PR and is green.
**Acceptance:** `npm ci` without `--legacy-peer-deps`; actions pinned by SHA; `permissions: contents: read`; `concurrency` per ref; job timeouts.
**Risks:** peer conflicts later (TypeScript 6 vs `openapi-typescript` peer `^5`): T0.2 verifies and records the outcome.

#### T0.2 · REST contract v1 and ADRs (L, high, lane C)

**Objective:** `packages/contract/openapi.yaml` covering every operation in §4.1 with schemas, examples and error responses; generated types; `docs/api/README.md` with the roles matrix (§4.3), error codes, pagination and concurrency rules.
**Dependencies:** T0.1. **Owner of:** the REST contract (later changes go through this owner, §8.2).
**Files:** `packages/contract/openapi.yaml`, `packages/contract/src/schema.ts` (generated, Prettier-ignored), `packages/contract/scripts/generate.mjs`, `docs/api/README.md`, `docs/decisions/0001-architecture-and-stack.md`, `0002-adopt-forma-ui.md`, `0003-internationalisation.md`, `0005-data-model-and-permissions.md`.
**Dependencies added:** openapi-typescript 7.13.0, `@redocly/cli` (lint only).
**Tests:** `api:lint` (Redocly); `api:types` + `git diff --exit-code` in **Static checks**; a test that every operation declares `operationId`, a `problem+json` default response and a security requirement (except health and sign-in/up).
**Acceptance:** each row of §4.3 maps to operations; ADRs record decisions and alternatives; no references to private material or internal tooling.

#### T0.3 · Collaboration protocol contract (M, high, lane C)

**Objective:** `docs/collab/protocol.md` and `packages/contract/src/collab.ts` with §5.1–§5.4 as normative text and Zod schemas (stateless events, close codes, anchor encoding helpers' types).
**Dependencies:** T0.1. **Files:** those two plus `docs/decisions/0006-collaboration-durability.md`, `0007-versions-and-restore.md`.
**Tests:** schema round-trip tests; a test that every close code and event type has an entry in both i18n catalogues' key lists (keys only; messages come in T0.5).
**Acceptance:** an implementer can build T2.1 and T2.2 from the document alone.

#### T0.4 · Server skeleton, database and contract harness (L, high, lane A)

**Objective:** a Fastify app with configuration, health endpoints, Kysely, migrations, the first schema, a development compose file and the integration test harness.
**Dependencies:** T0.1, T0.2. **Owner of:** `apps/server/src/db/migrations/` (one migration task at a time).
**Files:** `apps/server/src/config.ts` (Zod-validated env: `API_PORT`, `COLLAB_PORT`, `DATABASE_URL`, `SESSION_SECRET`, `ALLOWED_ORIGINS`, `NODE_ENV`), `src/http/app.ts`, `src/http/problem.ts`, `src/http/contract.ts` (ajv from the OpenAPI document), `src/http/routes/health.ts`, `src/db/database.ts`, `src/db/migrate.ts`, `src/db/migrations/0001_initial.ts` (`users`, `sessions`, `workspaces`, `memberships`, `folders`, `documents`, `document_access`, `document_states`, `pins`), `test/support/postgres.ts` (Testcontainers), `test/support/contract-coverage.ts`, `docker-compose.yml` (PostgreSQL 17, loopback port `${POSTGRES_PORT:-5460}`, healthcheck), CI job **Server integration (PostgreSQL)**.
**Dependencies added:** fastify 5.12.7, kysely 0.29.6, pg 8.23.1, zod 4.6.7, ajv, testcontainers 12.2.1, `@testcontainers/postgresql`.
**Tests:** migrations up on an empty database; health returns 200 and `ready` reports the database; every response in integration tests is validated against the contract (`additionalProperties: false`); the coverage harness fails the run if an implemented operation is never exercised.
**Acceptance:** composite keys `(workspace_id, id)` so cross-workspace references cannot be built; every table has `created_at`; `document_states.state bytea not null`.

#### T0.5 · Web skeleton: Forma UI, theme and i18n (M, medium, lane B)

**Objective:** a Vite React app that consumes Forma UI 0.3.0, switches light/dark/system, resolves the language and renders a placeholder route in both languages.
**Dependencies:** T0.1. **Files:** `apps/web/index.html` (head script: theme and language), `src/main.tsx`, `src/app/AppProviders.tsx` (`IntlProvider`, `FormaProvider`, `QueryClientProvider`), `src/i18n/{locale.ts,en.json,es.json,pseudo.ts}`, `scripts/check-messages.mjs`, `scripts/sync-forma-tokens.mjs`, `src/styles/{forma-tokens.css,global.css}`, `src/styles/tokens.sync.test.ts`.
**Dependencies added:** react 19.3.0, react-dom, vite 8.3.4, `@vitejs/plugin-react`, `@yelison/forma-ui` 0.3.0, react-intl, `@formatjs/cli`, `@tanstack/react-query`, react-router, `@testing-library/*`, jsdom.
**Tests:** locale resolution (stored, browser, fallback); `<html lang>` set before first paint; catalogue parity; token copy equals the package; pseudo-locale build renders.
**Acceptance:** CSS order per Forma UI (`base.css`, `styles.css` first); no hard-coded visible string.

#### T0.6 · App shell, routes and desktop guard (M, medium, lane B)

**Objective:** the route table of §1.3 with layouts: overview layout (208 px rail with labels) and editor layout (88 px rail, explorer, work area), active section rule, desktop requirement screen below 1280 px, not-found route.
**Dependencies:** T0.5. **Owner of:** `apps/web/src/app/routes.tsx` (later UI tasks add routes one at a time).
**Files:** `src/app/routes.tsx`, `src/app/layouts/{OverviewLayout,EditorLayout}.tsx`, `src/components/NavRail/`, `src/app/DesktopGuard.tsx`.
**Tests:** the active rail item for each route; keyboard order (skip link, rail, main); focus moves to the main heading on navigation and never stays on `body`; guard at 1279/1280 px.
**Acceptance:** rail label "Settings"/"Configuración" matches the page; screenshots at 1280 and 1440 in both themes attached to the delivery.

#### T0.7 · Data-source boundary, mocks and the mocked e2e gate (L, high, lane B)

**Objective:** §3.7: `DataSource`, `HttpDataSource` (REST only for now), `MockDataSource` with contract-typed fixtures, query keys, Playwright set-up against the mock, production-bundle guard.
**Dependencies:** T0.2, T0.5. **Files:** `src/data/{DataSource.ts,queryKeys.ts,http/,mock/,contract.suite.ts}`, `src/data/select.ts` (build-time choice), `e2e/fixtures.ts`, `e2e/production-bundle.spec.ts`, `playwright.config.ts` (`PLAYWRIGHT_PORT`, `--workers=2` locally), CI job **Web e2e (mocked API)**.
**Tests:** the contract suite passes on the mock; mock responses validated at runtime against the OpenAPI schemas in tests (Resolve only checked them at compile time); a production build contains no mock module or fixture string.
**Acceptance:** an unhandled mock route fails loudly; the HTTP implementation compiles against generated types only.

#### T0.8 · Product token layer (M, medium, lane B)

**Objective:** `draftroom-tokens.css` generated from the product token source (kept outside this repository; only the generated file is committed), with a test that it redeclares no Forma UI token, and every product colour that differs from Forma UI resolved by Q3 (D9, D10).
**Dependencies:** T0.5 and the product token source. **Files:** `apps/web/src/styles/draftroom-tokens.css` (generated, with a header naming its generator), `apps/web/src/styles/draftroom-tokens.test.ts`, `docs/decisions/0008-product-tokens.md`.
**Acceptance:** no token resolved silently; contrast pairs for every text/background pair pass WCAG AA in both themes.

### Phase 1 · Local editor

#### T1.1 · Documents and folders API with server authorisation (L, high, lane A)

**Objective:** workspaces (read), folders, documents (list, search, create, get, rename, move, archive, restore, delete), pins, templates, with the permission resolver of §4.3 and the development identity.
**Dependencies:** T0.4. **Files:** `src/domain/permissions.ts` (pure: `effectiveRole(input): DocumentRole | null`, `can(role, operation): boolean`), `src/domain/documents.ts`, `src/http/auth/devIdentity.ts`, `src/http/routes/{workspaces,folders,documents,pins,templates}.ts`, migration `0002_activity_and_templates.ts`, `src/db/demo-seed/` (fictional people, English and Spanish content), `test/documents.api.test.ts`, `test/isolation.test.ts`, `test/access-matrix.test.ts` (operations × roles, extended by later tasks).
**Tests:** every operation × role; ids of another workspace return 404; archived documents cannot be read or modified by non-owners through any route; search never returns documents without read access; `revision` conflicts; pagination stability with equal timestamps.
**Acceptance:** `effectiveRole` unit-tested exhaustively (table-driven); creating a document writes an empty `document_states` row and an activity event in one transaction.

#### T1.2 · Editor with a local document (L, high, lane B)

**Objective:** the editor screen with Tiptap 3.31.4 on a local `Y.Doc` (no provider yet): title field (metadata), headings, paragraphs, lists, links, bold, italic, code; toolbar inside the work area; paste sanitisation; keyboard shortcuts. Creates `packages/editor-schema` with the extension list both client and server import.
**Dependencies:** T0.6, T0.7. **Files:** `packages/editor-schema/src/{extensions.ts,convert.ts,index.ts}` (`editorExtensions(options)`, `jsonToYUpdate(json): Uint8Array`, `yUpdateToJson(update): JSONContent`), `apps/web/src/features/editor/{EditorScreen,Toolbar,TitleField,sanitizePaste.ts}`.
**Dependencies added:** `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-collaboration`, `@tiptap/y-tiptap`, yjs 13.6.33 (all exact).
**Tests:** `jsonToYUpdate` then `yUpdateToJson` round-trips every node and mark in Node (no DOM); pasting HTML with scripts, event handlers, `javascript:` links and styles keeps only allowed nodes; links get `rel="noopener noreferrer"`; toolbar buttons have accessible names and pressed state; title edit calls `PATCH` with `revision` and handles `409`.
**Acceptance:** the sheet keeps 708 px at 1440 and adapts at 1280; StarterKit's `undoRedo` disabled.

#### T1.3 · Explorer, Documents and folder screens (M, medium, lane B)

**Objective:** the explorer (search, recents, folders, documents, selected row follows the open document), the Documents overview, folder screens, create, rename and archive from the UI.
**Dependencies:** T0.7, T1.1 (contract only). **Files:** `src/features/explorer/`, `src/features/documents/`, `src/components/DocumentRow/`.
**Tests:** keyboard navigation in the tree (arrow keys, Home/End, type-ahead); selection vs focus are distinct; empty, loading and error states; archiving the open document navigates away with an announcement.

### Phase 2 · Durable collaboration

#### T2.1 · Collaboration server (L, high, lane A)

**Objective:** Hocuspocus 4.7.1 per §5.1–§5.3: authentication from the session, read-only by role, persistence in `document_states`, durable `stored` acknowledgement, awareness guard, limits, close codes, graceful shutdown that stores pending documents.
**Dependencies:** T0.3, T1.1. **Files:** `src/collab/{server.ts,authenticate.ts,persistence.ts,durableAck.ts,awarenessGuard.ts,limits.ts}`, `test/collab/*.test.ts` (raw `ws` client and `HocuspocusProvider` client in Node).
**Dependencies added:** `@hocuspocus/server` 4.7.1, `@hocuspocus/provider` 4.7.1 (tests), `ws`.
**Tests:** no cookie or no access → rejected before any document data is sent; viewer and commenter connections are read-only (`authorizedScope === 'readonly'`) and a raw update they send is neither applied, persisted nor broadcast; an editor's update is stored and followed by a `stored` event whose state vector covers it; server restart loads the stored binary state (no JSON path exists); spoofed awareness `user.id` is dropped; oversize message closes with `4413`.
**Acceptance:** the field used for read-only is asserted by behaviour, not by name.

#### T2.2 · Client collaboration and sync states (L, high, lane B)

**Objective:** `CollabSession` for `HttpDataSource` and `MockDataSource`; Collaboration + CollaborationCaret; presence list (Presence component); the sync-state machine of §5.2 driving SyncStatus; read-only modes.
**Dependencies:** T1.2, T2.1 (protocol). **Files:** `src/collab/{session.ts,syncState.ts,awareness.ts}`, `src/components/{SyncStatus,Presence,Avatar}/`, `src/features/editor/CollaborationExtensions.ts`.
**Dependencies added:** `@hocuspocus/provider` 4.7.1, `@tiptap/extension-collaboration-caret` 3.31.4.
**Tests:** the state machine as a table of events → states (including "stored arrives before the provider's ack", "store fails", "viewer sends nothing and is never unsynced"); undo reverts only local edits with a simulated remote peer; caret labels use the server-provided name.
**Acceptance:** the SyncStatus live region announces changes once, not on every keystroke.

#### T2.3 · Offline copy and revocation on reconnect (M, high, lane B)

**Objective:** §5.6 with `y-indexeddb`: per-account key, purge on sign-out and account switch, no upload after a failed re-authentication, `offline-local` and `revoked` states.
**Dependencies:** T2.2. **Files:** `src/collab/offlineCache.ts`, tests with `fake-indexeddb`.
**Dependencies added:** y-indexeddb 9.0.12, fake-indexeddb (dev).
**Tests:** edits made offline reach the server after reconnect when access is intact; with access revoked during the outage they never reach it (server-side assertion in T2.4) and the copy is purged.

#### T2.4 · Multi-user e2e against the real stack (L, high, lane C)

**Objective:** Playwright with two browser contexts against PostgreSQL + server + preview build; CI job **Collaboration e2e (real stack)**; the shared contract suite also runs against the real server here.
**Dependencies:** T2.1, T2.2, T2.3. **Files:** `apps/web/e2e-collab/*.spec.ts`, `apps/web/playwright.collab.config.ts`, `docker-compose.ci.yml` or CI service containers, `scripts/wait-for.mjs`.
**Tests:** concurrent inserts in the same paragraph converge without duplication; the same with one context offline (`context.setOffline`) and reconnected; server restart then a new context sees the persisted content; "Synced" never shown while the server is stopped; revocation during an outage (Review Focus 4) end to end.
**Acceptance:** traces and server logs uploaded on failure; runs with `--workers=1` in CI.

### Phase 3 · Comments

#### T3.1 · Comments API and realtime notification (M, high, lane A)

**Objective:** threads, replies, resolve and reopen, edit and delete per §4.3; anchors stored as opaque encoded positions with the quote; `comments-changed` broadcast to connected clients.
**Dependencies:** T2.1. **Files:** migration `0003_comments.ts`, `src/domain/comments.ts`, `src/http/routes/comments.ts`, `test/comments.api.test.ts`.
**Tests:** matrix rows for comments; cross-workspace thread ids return 404; a viewer cannot comment over REST even with a crafted request; limits; an activity event per thread action.

#### T3.2 · Comments panel and anchors (L, high, lane B)

**Objective:** the collaboration panel with tabs Comments and Activity, CommentCard (open, resolved, orphaned), create from a selection, highlights as decorations, orphan detection, keyboard flow (open thread from highlight and back).
**Dependencies:** T3.1, T2.2. **Files:** `src/features/comments/{CommentsPanel,anchors.ts,highlightPlugin.ts}`, `src/components/CommentCard/`.
**Tests:** anchors survive inserts before, inside and after the range by a remote peer; deleting the whole range orphans the thread; deleting half keeps the remaining range; resolved threads hide their highlight; commenters can create threads while the editor is read-only.

### Phase 4 · Permissions and sharing

#### T4.1 · Access management and live revocation (L, high, lane A)

**Objective:** access and general-access endpoints, workspace members endpoints, last-owner protection, revocation and downgrade of live WebSocket connections (`4403`, `4409`), activity events; the access matrix completed for REST and WebSocket.
**Dependencies:** T2.1, T1.1. **Files:** `src/domain/access.ts`, `src/http/routes/{access,members}.ts`, `src/collab/revocation.ts`, `test/access-matrix.test.ts`, `test/collab/revocation.test.ts`.
**Tests:** every operation × role over REST and the content-write operation over WebSocket; removing a member closes their open connections in every document of the workspace; downgrading editor → viewer forces a read-only reconnect and their next raw update is rejected.

#### T4.2 · Share dialog and Shared with me (M, medium, lane B)

**Objective:** the share dialog route (members with roles, add, change, remove, general access), Permission component with all four variants, Shared with me table with filters and preview, viewer and commenter UI, revoked state.
**Dependencies:** T4.1, T0.7. **Files:** `src/features/sharing/`, `src/features/shared/`, `src/components/Permission/`.
**Tests:** focus returns to the Share button after closing; role changes announced; the last owner cannot be demoted in the UI and the server error is shown if it happens anyway.

### Phase 5 · History

#### T5.1 · Versions and restore on the server (L, high, lane A)

**Objective:** §5.5: automatic and manual versions, list, content download, restore with pre-restore version, activity events, `versions-changed` broadcast.
**Dependencies:** T2.1, T4.1, `packages/editor-schema` (T1.2). **Files:** migration `0004_versions.ts`, `src/domain/versions.ts`, `src/collab/restore.ts` (reads the version through `yUpdateToJson` and writes it into the live fragment with the conversion helpers; Yjs types cannot be moved between documents), `src/http/routes/versions.ts`, `test/versions.test.ts`. The exact `@tiptap/y-tiptap` exports used are verified against the installed version before writing the restore.
**Tests:** restore while two connected editors keep typing (Review Focus 5): final state equals the restored content plus edits after the restore, the pre-restore version equals the state before it, no exception; restore by a non-owner is 403 over REST; automatic versions respect the idle and minimum-interval rules (fake timers).

#### T5.2 · Version history screen (M, medium, lane B)

**Objective:** `/documents/:id/versions`: list, read-only preview, restore confirmation dialog (owner), restore in progress and failure states.
**Dependencies:** T5.1. **Files:** `src/features/versions/`.
**Tests:** preview never connects to the live document; non-owners see no restore action; focus management in the confirmation dialog.

#### T5.3 · Workspace history and document activity (M, high, lane A + B)

**Objective:** activity API filtered by read access at query time, timeline screen with filters and side panel, Activity tab in the editor panel.
**Dependencies:** T4.1. **Files:** `src/http/routes/activity.ts`, `src/features/history/`.
**Tests:** events of documents the caller cannot read never appear, including after access is revoked; filters combine; pagination with many events at the same timestamp.

### Phase 6 · Remaining desktop screens

#### T6.1 · Home (S, medium, lane B)

Pinned documents with excerpts (first paragraph text stored in `documents.excerpt`, updated on store), recent activity, empty states. Depends on T1.1, T5.3.
**Files:** `apps/web/src/features/home/`, `apps/server/src/collab/excerpt.ts` (computed in `onStoreDocument` through `yUpdateToJson`), migration for `documents.excerpt`.
**Tests:** the excerpt never includes content of documents without access; pin toggling; empty and error states.
**Risks:** computing the excerpt on every store adds latency: it runs after the store and never blocks the durable acknowledgement.

#### T6.2 · Settings (M, medium, lane A + B)

Profile (name, language preference stored on the account), Workspace (name), Members (invite by email, roles, removal), Appearance (light, dark, system; editor text size). Depends on T4.1.
**Files:** `apps/web/src/features/settings/{ProfileTab,WorkspaceTab,MembersTab,AppearanceTab}.tsx`, `apps/server/src/http/routes/profile.ts`, a migration for `users.locale` and `users.editor_text_size`; contract change for `PATCH /api/me` through the contract owner.
**Tests:** language preference applies on next load and overrides the browser; theme persists; last-owner protection in Members; each tab's save success, validation and server error.
**Risks:** a contract change mid-phase: requested before the task starts, not during it.

#### T6.3 · Templates (S, medium, lane A + B)

Built-in localised templates served by `GET /api/templates`; creating a document from a template writes its content into the new document's initial Yjs state on the server with `jsonToYUpdate` from `packages/editor-schema`. Depends on T1.1, T1.2.
**Files:** `apps/server/src/domain/templates/{en,es}/*.json` (ProseMirror JSON, validated against the schema at start-up), `apps/server/src/domain/templates.ts`, `apps/web/src/features/templates/`.
**Tests:** the created document's stored state is a Yjs update that loads in a fresh `Y.Doc`; the template language follows the request locale; an invalid template fails start-up, not a request.
**Risks:** templates drifting from the schema: start-up validation catches it.

#### T6.4 · Trash (S, medium, lane B)

Archived documents of the caller (owners), restore and permanent delete with confirmation. Depends on T1.1, T1.3.
**Files:** `apps/web/src/features/trash/`, server tests in `apps/server/test/documents.api.test.ts`.
**Tests:** a permanently deleted document's state, versions, threads and access rows are gone (foreign keys with `on delete cascade`); its id returns 404; live connections to it close.
**Risks:** irreversible action: confirmation dialog names the document and focus starts on Cancel.

#### T6.5 · Desktop adaptation and accessibility pass (M, medium, lane B)

1280–1440 behaviour (D8), closable comments panel, zoom 200 %, axe on every route in both themes and languages, pseudo-locale overflow check, reduced motion. Depends on all screens.
**Files:** `apps/web/src/app/layouts/EditorLayout.tsx` (panel state), `apps/web/e2e/a11y.spec.ts`, `apps/web/e2e/overflow.spec.ts`, `apps/web/e2e/routes.ts` (one list of routes and states).
**Tests:** axe and overflow over the route list in 2 themes × 2 languages × 1280/1440; panel toggle keeps focus and announces.
**Risks:** run time: the matrix runs in CI only; locally one theme and language.

### Phase 7 · Authentication and hardening

#### T7.1 · Sign-up, sign-in and sessions (L, high, lane A + B)

§3.4 (pending Q1): migration for credentials, Argon2id, session rotation, CSRF, login rate limit, sign-out purges offline copies, sign-in and sign-up screens in both languages, pending member invitations accepted at sign-up. Depends on T4.1.
**Files:** `apps/server/src/http/auth/{passwords.ts,sessions.ts,csrf.ts,rateLimit.ts}`, `apps/server/src/http/routes/auth.ts`, migration `credentials`, `apps/web/src/features/auth/`, `docs/decisions/0004-authentication.md`.
**Dependencies added:** `@node-rs/argon2` 2.2.2, `@fastify/cookie`, `@fastify/rate-limit`.
**Tests:** session fixation, CSRF missing or wrong, rate limit, WebSocket rejected after sign-out, cookie flags in production mode, timing-safe comparison, no account enumeration in sign-in errors.
**Risks:** security-critical: high-effort review that repeats the attacks against the running stack.

#### T7.2 · Hardening (M, high, lane A)

Security headers and CSP (hash of the single inline script), CORS by `ALLOWED_ORIGINS`, body and message limits, REST and WebSocket rate limits, production build guard against `X-Dev-User` and mock code, dependency audit in CI, threat checklist (§9.3) as tests. Depends on T7.1, T3.1.
**Files:** `apps/server/src/http/security.ts`, `apps/server/test/security/*.test.ts`, `.github/workflows/ci.yml` (audit step).
**Tests:** one per §9.3 row not already covered; the CSP hash matches the built `index.html`.
**Risks:** a too-strict CSP breaking the theme and language head script: the hash is generated from the build, not hand-written.

### Phase 8 · Deployment readiness and demo

#### T8.1 · Production packaging, backup and restore (L, high, lane C)

**Risks:** secrets in images or examples (checked by a test over `deploy/`), migrations racing on two starts (advisory lock), backups never restored (the CI drill restores one). Multi-stage `Dockerfile` (server serves the built web app or a proxy does), `deploy/docker-compose.prod.yml` (Caddy for HTTPS and WSS with upgrade headers, server, PostgreSQL with a volume), migrations at start-up with a lock, `GET /api/health/ready` as healthcheck, `deploy/env.example` (no secrets), `scripts/backup.sh` and `scripts/restore.sh` (`pg_dump` custom format), a CI job that restores a backup into a fresh database and opens a document, `docs/deploy/README.md` (any host with Node 24 and PostgreSQL 17; reverse proxy; scaling note: one collaboration instance per document), README "Run it yourself". Depends on T7.1.

#### T8.2 · Static demo on GitHub Pages (M, medium, lane B + C)

**Risks:** mock code leaking into the production bundle (guard from T0.7); the demo implying real collaboration (stated in README and video, not in the UI). `build:demo` (`VITE_DATA_SOURCE=mock`, base path `/draftroom/`, `404.html` copy), demo content in both languages, scripted collaborator and cross-tab collaboration via `BroadcastChannel`, state reset on reload, `.github/workflows/pages.yml`, `e2e-demo/` asserting no request reaches the network. Depends on T0.7 and the screens. The README and the demo video say that the demo's collaboration is simulated in the browser; the app UI does not.

#### T8.3 · README tour and architecture document (S, medium, lane C)

**Files:** `scripts/readme-tour/`, `docs/assets/`, `docs/architecture.md`, `README.md`. **Risks:** stale screenshots: the script is rerun before each release. Screenshots and a short video recorded against the real stack by a script; `docs/architecture.md` with a diagram of the two listeners, the data flow and the durability acknowledgement. Depends on T8.1, T8.2.

## 8. Dependencies, parallel batches and ownership

### 8.1 Dependency table

| Task | Depends on | Lane |
| --- | --- | --- |
| T0.1 | — | C |
| T0.2, T0.3 | T0.1 | C |
| T0.4 | T0.1, T0.2 | A |
| T0.5 | T0.1 | B |
| T0.6 | T0.5 | B |
| T0.7 | T0.2, T0.5 | B |
| T0.8 | T0.5, product token source | B |
| T1.1 | T0.4 | A |
| T1.2 | T0.6, T0.7 | B |
| T1.3 | T0.7, T1.1 | B |
| T2.1 | T0.3, T1.1 | A |
| T2.2 | T1.2, T2.1 | B |
| T2.3 | T2.2 | B |
| T2.4 | T2.1, T2.2, T2.3 | C |
| T3.1 | T2.1 | A |
| T3.2 | T3.1, T2.2 | B |
| T4.1 | T1.1, T2.1 | A |
| T4.2 | T4.1, T0.7 | B |
| T5.1 | T2.1, T4.1 | A |
| T5.2 | T5.1 | B |
| T5.3 | T4.1 | A + B |
| T6.1 | T1.1, T5.3 | B |
| T6.2 | T4.1 | A + B |
| T6.3 | T1.1, T1.2 | A + B |
| T6.4 | T1.1, T1.3 | B |
| T6.5 | all screens | B |
| T7.1 | T4.1 | A + B |
| T7.2 | T7.1, T3.1 | A |
| T8.1 | T7.1 | C |
| T8.2 | T0.7, screens | B + C |
| T8.3 | T8.1, T8.2 | C |

**Safe batches** (at most two implementers working at a time, one on the server lane): {T0.1} → {T0.2, T0.5} → {T0.3, T0.6} → {T0.4, T0.7} → {T1.1, T1.2} → {T2.1, T1.3} → {T2.2, T3.1} → {T2.3, T4.1} → {T2.4, T3.2} → {T5.1, T4.2} → {T5.3, T5.2} → {T6.2, T6.1} → {T6.3, T6.4} → {T7.1, T6.5} → {T7.2, T8.2} → {T8.1} → {T8.3}. T0.8 slots in as soon as the product token source exists.

### 8.2 Single owners

| Resource | Owner | Rule |
| --- | --- | --- |
| `package-lock.json` and root configs | the task that adds dependencies (one at a time) | two tasks that add dependencies never run in parallel; the second rebases |
| REST contract | T0.2, then a contract task per change | a task needing a contract change stops with a blocked report |
| Collaboration protocol (anchors, events, close codes) | T0.3 | same |
| Yjs document schema (`packages/editor-schema`: extensions, `default` fragment, conversion helpers) | T1.2, then one task per change | a node or mark added later must keep old documents and stored versions loadable |
| Migrations | lane A, one task at a time | numbered sequentially; never edited after merge |
| Authentication | T7.1 (and T1.1 for the development identity) | same |
| `routes.tsx` | lane B, one task at a time | |

Integration is sequential: each pull request is rebased on `main`, passes the required checks and is squash-merged; nothing merges automatically without its review.

## 9. CI, threats and review

### 9.1 Required checks (job names are the ruleset contract)

| Job | Runs | Introduced |
| --- | --- | --- |
| Static checks | lint, format, typecheck, catalogue parity, contract drift, token sync | T0.1, extended by T0.2/T0.5 |
| Server integration (PostgreSQL) | Vitest unit and integration with Testcontainers: contract validation, operation coverage, access matrix, collaboration tests | T0.4 |
| Web e2e (mocked API) | Playwright on the production build with the mock data source, production-bundle guard | T0.7 |
| Collaboration e2e (real stack) | two-context Playwright against PostgreSQL + server + preview | T2.4 |

Optional jobs: Pages demo build and its no-network check (T8.2), backup/restore drill (T8.1), dependency audit (T7.2).

### 9.2 Simulation vs real

| Concern | Proven by simulation (mock) | Proven against the real stack |
| --- | --- | --- |
| Screens, states, i18n, accessibility | yes | smoke only |
| Convergence, offline, reconnect, restart | no (single Y.Doc in the browser) | T2.4 |
| Permissions | no (the mock does not enforce them) | T1.1, T4.1, T2.1 |
| Durability label | state machine unit tests | T2.4 with the server stopped |

### 9.3 Threats with a test

| Threat | Test |
| --- | --- |
| Reading another workspace's document by id (REST and WebSocket) | `isolation.test.ts`, `collab/authenticate.test.ts` |
| Viewer or commenter writing content | `collab/readonly.test.ts` (raw update) |
| Revoked user keeps editing | `collab/revocation.test.ts`, T2.4 |
| Spoofed presence identity | `collab/awareness.test.ts` |
| Script injection by paste or link | `sanitizePaste.test.ts`, link protocol tests |
| CSRF on unsafe methods | `auth/csrf.test.ts` |
| Session fixation, cookie flags | `auth/session.test.ts` |
| Oversized messages or documents | `collab/limits.test.ts`, REST limit tests |
| Enumeration through 403 vs 404 | access-matrix assertions |
| Demo or development identity in production | `production-bundle.spec.ts`, server start-up test with `NODE_ENV=production` |

### 9.4 Review checklist (every pull request)

Contract and matrix rows touched; tests fail without the change (mutation shown); server-side enforcement for any permission; both languages; all states of the screen; focus and live regions; no layout shift; no developer-voice copy; durability rule; no new dependency outside the task; structure and naming (portfolio quality, §11).

## 10. Environments and deployment

- **Local development:** `docker compose up -d --wait` (PostgreSQL), `npm run dev` (server with watch on `API_PORT` 8380 and `COLLAB_PORT` 8480, Vite on 5380 proxying `/api` and `/collab`). Parallel worktrees add a slot number n: Vite 5380+n, preview 4380+n, API 8380+n, collaboration 8480+n, PostgreSQL 5460+n, Compose project `draftroom-<task>`, database `draftroom_<task>`.
- **CI:** as §9.1.
- **Public demo:** GitHub Pages, static, simulated API (T8.2). Cost: none.
- **Production (prepared, not deployed):** T8.1 packages the real backend so it can be connected later: HTTPS and WSS through a reverse proxy, health checks, migrations at start-up, backups with a tested restore, secrets only from the environment (`SESSION_SECRET`, `DATABASE_URL`), CORS and cookie domain from configuration, one collaboration instance per document (horizontal scaling would need Hocuspocus's Redis extension: deferred). The deploy guide documents a free option (a free web service with sleep after inactivity plus a free managed PostgreSQL) and a small VPS, with their limits; no account is created and nothing is deployed without the owner's authorisation.

## 11. Quality (portfolio project)

The code is read as much as it is used. Each task is reviewed for: small single-purpose modules with feature folders; pure domain logic separated from I/O (`apps/server/src/domain` has no imports from `http`, `collab` or `db`, enforced by a lint rule); strict types with no `any`, no needless casts and generated types for contracts; components with one responsibility, state colocated, no effects where render suffices; CSS from tokens with flat CSS Modules; tests that read as behaviour documentation (roles and accessible names, table-driven matrices); comments that explain why; ADRs for every architectural choice; READMEs that let a stranger run the project in minutes.

## 12. Questions, defaults and risks

### 12.1 Questions for the owner (by priority)

| # | Question | Default if unanswered | Blocks |
| --- | --- | --- | --- |
| Q1 | Authentication: own email and password accounts, or OIDC with an identity provider (Keycloak, as in Resolve)? | Email and password with Argon2id (§3.4) | T7.1 (earlier tasks use the development identity) |
| Q2 | States and screens without a visual reference yet (D1, D12): build them in code from the product components, or wait for a reference? | Build in code; screenshots in each delivery | Phase 1 onwards |
| Q3 | Product colours that differ from Forma UI tokens (D10): adopt Forma UI's values, or request changes from Forma UI? | Adopt Forma UI's values; product-only tokens in Draftroom's layer | T0.8 |
| Q4 | Default general access of a new document: private (`none`) or workspace members as viewers/editors? | `none` (explicit sharing) | T1.1 |
| Q5 | Who restores versions and who archives: owners only (current), or also editors? | Owners only | T5.1 |
| Q6 | Language of the demo content and seed data | Both: content follows the language chosen in the demo; the server seed has one English and one Spanish workspace | T1.1 seed, T8.2 |

### 12.2 Risks

| Risk | Detected by | Mitigation |
| --- | --- | --- |
| "Synced" shown before durable storage | T2.2 state-machine table, T2.4 with the server stopped | §5.2 acknowledgement |
| Read-only bypass over WebSocket | T2.1 raw update test, T4.1 matrix | `connectionConfig.readOnly` asserted by behaviour |
| Hocuspocus field names differ between docs and code | T2.1 tests | behaviour assertions; pinned exact version |
| Tiptap version skew between packages | `npm ci` without peer overrides in **Static checks** | all `@tiptap/*` pinned to 3.31.4 |
| Anchors drift or attach to wrong text | T3.2 remote-edit anchor tests | relative positions, orphan rule |
| Restore loses concurrent edits | T5.1 concurrent restore test | pre-restore version, one transaction |
| Mock diverges from the server | shared contract suite on both (T0.7, T2.4) | runtime schema validation of mocks |
| Offline copy leaks between accounts | T2.3 purge tests | per-account keys, purge on sign-out |
| `y-indexeddb` is unmaintained since 2023 | T2.3 tests on the pinned version | thin wrapper (`offlineCache.ts`) to swap it |
| Shared machine load during e2e | CI timings, local `--workers=2` | full e2e only in CI |

### 12.3 First reviewable task

**T0.1 · Workspace tooling and first CI gate.** It unblocks every other task, has no product decisions and gives the ruleset its first required check.
