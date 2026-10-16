# 0013 · The unsynced marker belongs to the copy, and decides what is pending when a copy is opened

Status: accepted (2026-10-16, coordinator, after the review of the offline copy)

## Context

The collaboration protocol (§7.4) said that opening a document from a local copy makes all of the copy's content `pending`, and (§12.2) that each copy carries an `unsynced` marker that sign-out and account switch check before they purge. Building the offline copy (T2.3) and reviewing it found three problems:

- **A reader's copy is not changes.** With the rule as written, a reader (or an editor demoted to reader who wrote nothing) who reopens their copy has a non-empty `pending`, receives the discard of §12.4 and is told "Your offline changes weren't kept", which is false. Their copy is also deleted and made again on every opening.
- **The marker was written after the change.** The session wrote it, after the change reached the copy, in a transaction of its own with a scope disjoint from the one `y-indexeddb` uses for the update. IndexedDB gives no order between disjoint transactions, so a tab that died between the two left a change without a marker. On the next opening `pending` was empty, the server's last stored snapshot "covered" it, and the screen said "Synced" before the server had stored the change.
- **The copy is shared by every tab, the marker was not.** Each tab remembered in memory whether it had set the marker and cleared it when the snapshot covered *its own* `pending`. With two tabs on one document, one tab could clear the marker while the other still had changes the server had not stored, and the other never wrote it again. Sign-out then counted no unstored documents and purged without asking.

## Decision

1. **A copy is all `pending` on opening only if it carries the marker.** A copy without it holds only what the server stored (the marker is the persisted form of "`pending` is not empty"), so `pending` starts as nothing. A copy with it keeps the rule of §7.4: all of its content, until a `stored` snapshot contains it.
2. **The copy sets the marker, on every change of the person.** On the Yjs `afterTransaction` event of a local transaction that adds or deletes something, in an IndexedDB `readwrite` transaction whose scope is the marker's store and the updates store, created before `y-indexeddb` creates its own for the same change. Transactions with overlapping scopes run in creation order, so the marker is committed first. Nothing is cached in memory: a marker cleared by another tab is set again by the next change.
3. **The copy clears the marker only when the snapshot contains everything it holds.** In one transaction over the updates and the marker it reads every update, merges them, checks `Y.snapshotContainsUpdate` and deletes the marker. The session tells the copy about every `stored` event; whether it clears is the copy's decision.
4. **The marker is kept inside the copy** (the store `y-indexeddb` has for what is not an update), so deleting the copy deletes it, and it is read for sign-out without loading the copy's content.

## Consequences

- A reader's copy is kept across openings and nobody is told a loss that did not happen. `pending` and the marker mean the same thing again.
- The residual window of the first design is closed: a crash leaves, at worst, a marker without a change, which asks one confirmation too many and never loses one.
- Every change costs one more IndexedDB transaction (a put of one constant). `y-indexeddb` already writes a row per change.
- Clearing reads and merges every update of the copy on each `stored` event while the marker may be set, which is at most once per second of editing and stops as soon as it is cleared. A document near the 5 MiB limit pays a few milliseconds each time.
- Where the browser cannot store anything there is no copy, no marker and no confirmation: leaving an account finishes at once, and the editor tells the person that what they write offline is only in the tab.

## Alternatives considered

- **The literal rule: all of a copy's content is always `pending`.** Rejected: it produces the false notice and the purge-and-recreate on every opening of a reader's copy, and marks a reader's copy, so sign-out asks about changes that do not exist. It remains the only rule with no exception at all for durability, which is what the second and third decisions restore for the marked copies.
- **Keep the marker in the session and order the writes in the session.** Rejected: the session cannot create a transaction before the one `y-indexeddb` creates in the same event, and it does not know what other tabs wrote.
- **Clear the marker when this tab's `pending` is covered.** Rejected: it is the third problem above.
- **A change counter or a version number in the copy.** Rejected: the snapshot already says what the server stored, and containment is the rule the whole protocol uses (ADR 0006).
