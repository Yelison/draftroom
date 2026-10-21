# 0021 · Settings is a dialog over the page, kept in the address as `?settings=`

Status: proposed (2026-10-20, r11)

## Context

Settings has three short sections (profile, appearance, workspace) that people visit rarely, so it no longer has a page or a place in the navigation. It opens from the person at the foot of the rail, as a dialog over the page they were on, and it has to work from every page, the editor included.

The dialog of sharing (`/documents/:id/share`) is a route, and it works because it is a child of the editor's route: the editor renders it in its own `Outlet`, so the document stays mounted behind it. Settings has no such parent. A path such as `/settings` is a sibling of every page: the router matches it and nothing else, and the page the person was on (with its Yjs document, its connection and its selection) is unmounted. The routes that load a screen with `lazy`, a loader or a `HydrateFallback` cannot be rendered a second time for the page behind, which rules out a "background location" with `<Routes location>`.

## Decision

1. **The dialog is open while the address has `?settings=<section>`, over whatever path the address names.** Changing only the search never changes which routes match, so the page behind stays mounted, and the focus hook of the navigation, which acts on a change of path, does not move the focus.
2. **Opening adds a history entry** with the search merged into the current one (`?q=…&settings=profile` keeps the query of a search page) and a marker in its state. Closing steps back when the marker is there, so the history is as it was and Back does not reopen the dialog; otherwise (a link, a reload) it replaces the entry with the parameter removed. Escape, Done and the browser's Back all end the same way, and the focus goes to the person's button, never to the body.
3. **The old addresses are redirects.** `/settings`, `/settings/profile`, `/settings/appearance` and `/settings/workspace` go to `/?settings=<section>` before anything renders, so a link or a bookmark opens the dialog over Home; `/settings/members` still goes to `/members`.
4. **The value is the section the link names.** The dialog shows the three sections in one column, so the value only says where it opens: the first control of that section takes the focus, which also brings it into view. An empty or unknown value opens at the top.
5. **One component owns the dialog and its trigger** (the person's button in the rail), which is mounted by both layouts through `NavRail`. It is rendered in a portal on `document.body`, out of the navigation landmark.

## Consequences

- The editor, its document and its connection are untouched while Settings is open, which a route of its own could not give.
- A direct link is one address, so it can be shared, but it is `/?settings=profile` and not a path: the dialog cannot be told apart from a page by its path, and the `dialog` flag of the route `handle` (used by sharing) does not describe it.
- Anything that rewrites the whole query string of a page would close the dialog. The one page that edits its query today (the history filters) builds the new one from the current one, so it keeps the parameter; a page that does not must do the same.
- Tests of the history (open, Escape, Done, Back, a link, the editor behind) and of the focus (to the dialog, back to the person) cover what the router would otherwise have given for free.
