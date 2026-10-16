# 0012 · Access management and live revocation: the role at the moment of writing, and "commit, then close"

Status: proposed (2026-10-16, with the access and member routes)

## Context

Changing who can open a document (`setAccess`, `removeAccess`, `setGeneralAccess`) or who belongs to a workspace (`addMember`, `updateMember`, `removeMember`) is the one place where a mistake lets somebody read or write who no longer may. Two things make it harder than the operations before it:

- **The role is read outside the transaction that writes** (ADR 0010: the authorisation is read before the write). `authoriseDocument` and `authoriseWorkspace` run before the transaction, as in ADR 0010. Between that read and the write, another request can take the caller's authority away, and the write would still go through with the role they had.
- **People have the document open.** A change that is committed does nothing to a WebSocket connection that authenticated earlier: it keeps the mode it was given. Protocol §6.3 says how to end one; it does not say who decides, in what order with the commit, or what happens to a connection that is still being established.

## Decision

### 1. The role is read again once the locks are held

Every write of this task has two checks of the caller's role. The first is the one every route has, before the transaction: it keeps a person who may not act from taking any lock, and it answers `404` and `403` in the order of the API. The second is inside the transaction, after the locks below, with the same functions (`authoriseDocument`, and for members the locked memberships and `canInWorkspace`), so it uses the same rules and no second implementation of the precedence. If it refuses, it throws a `ProblemError` from inside the transaction, which rolls back: nothing is written, and the answer is the one the role gives now.

The locks, always taken in this order and no other:

| Order | What | Mode | Who takes it | What it protects |
| --- | --- | --- | --- | --- |
| 1 | the memberships of the caller and of the person the change is about | `for share` (access), `for no key update` (members) | access routes; member routes, which also lock every owner of the workspace | the caller's workspace role, which is half of their authority; an owner who is demoted at the same moment |
| 2 | the document, or the documents a removal hands over, by id | `for no key update` | access routes; `removeMember` | every change to who can open a document happens one at a time, so the grant of the caller (the other half of their authority) and the number of explicit owners are read after the last change that touched them |
| 3 | the grants | the writes themselves | | |

Why this and not the alternatives:

- **Lock only the caller's grant row `for share`** (the other option the review allowed). It covers an owner whose grant is removed, not an owner of the workspace who is demoted, and it does nothing for the last-owner rule. The authority of a caller is made of their membership, their grant and the document, and a change to any of them has to be waited for.
- **Recheck in the `INSERT`/`UPDATE` itself** (`... where exists (select ... role = 'owner')`). It is one statement, but it is a second implementation of the precedence of ADR 0005 in SQL, which ADR 0010 rejected for the lists, and it still would not serialise the last-owner count.
- **One lock for everything** (the workspace). It would work and would make every comment, rename and pin on every document of a workspace wait behind a change of access.

The memberships are locked by id, and a removal locks its documents by id after them, so two changes that overlap take the same locks in the same order and cannot wait for each other. `for no key update` does not conflict with the key-share locks that foreign keys take, so a comment or a pin being written does not wait for a change of access.

**The last owner.** A workspace keeps an owner who can act, and a document keeps an explicit `owner` grant held by somebody who can act (ADR 0005). The count is made under the locks above, from the rows as they are then, so two owners who step down at the same moment leave one (the second sees the first and is refused with `409 last-owner`), and a member's removal that hands a document over cannot be undone by another owner losing the grant at the same time. A member added by email who has not signed up holds an owner role but nobody can act as them; they do **not** count as the owner that is kept. Counting them would let the only owner who can act step down and leave the workspace, or a document, that nobody can change until the pending person signs up with the right address. This is stricter than the contract's wording and is listed as a pending decision for the owner.

**Removing a member.** The documents the person alone owned go to the owner who makes the request (when an owner removes themselves, to the one who has been an owner the longest among those who remain, by `memberships.created_at` and then id), archived documents included, with one `access.granted` event for each. Everything else they held goes with their membership. The hand-over comes before the delete of the membership, which cascades.

**No migration, no new event type.** The schema already holds all of this, and `ActivityType` has `access.granted`, `access.changed`, `access.revoked` and `general-access.changed`. Membership changes have no event: the history is document-scoped (docs/api/README.md). A change that changes nothing (a grant to the role it has, the general access it already has, a member's own role) records nothing and closes nothing.

### 2. Commit, then close, from a fresh read

Revocation (`src/collab/revocation.ts`) is called by the routes through a port (`LiveAccess`) after the transaction has committed, never inside it, as protocol §6.3 and the marks of ADR 0011 §3 require. It does not take from the change a description of what happened. It **reads from the database what each person holds now** (their workspace role, grant, the general access and whether the document is archived, in one query) and holds every connection the change could reach to that:

| The connection was made | The person now has | Result |
| --- | --- | --- |
| any mode | nothing, or the document is archived and they do not own it | `4403` (`access-revoked`) |
| read-write | only read | `4409` (`role-changed`) |
| read-only | write | `4409` (`role-changed`) |
| the same mode | | nothing |

Modes are compared, not roles: an editor made an owner keeps writing and is left alone, and the role in a connection's context goes stale after such a change without mattering. The comparison is a pure function (`closureFor`, `domain/access.ts`) tested as a table, and `connectionModeFor` gives the mode, so the connection and REST read the same rules.

Why a fresh read after the commit and not the roles each transaction computed:

- Two changes that overlap each read the database before the other has committed. Take `setGeneralAccess` (viewer to none) and `removeAccess` of a viewer grant, for the same person, at the same moment: if each decided from its own transaction, neither would see an empty role and the connection would survive both. A read made after one's own commit sees every change that committed before it, so the one that finishes last sees both.
- It is also the only form that makes the order "commit, then close" mean something: a connection that takes its ticket after the mark is taken to have read the database after the change (ADR 0011 §3), which is true only if what the closing reads is at least as new.

The scope of a call:

- `documentChanged(documentId)` for `setAccess`, `removeAccess` and `setGeneralAccess` reads every member of the document's workspace and holds every connection of that document to it. This is how `setGeneralAccess` reevaluates the people who depend on it: a person with an explicit grant keeps their mode, and one who only had the general access loses it. It first sends `access-changed` to every connection of the document, so the connections about to close hear what happened before the close frame (frames of one socket arrive in order), and the ones that stay refresh what they show. Nothing is sent to a socket that is already closing.
- `memberChanged(workspaceId, userId)` for `removeMember` and `updateMember` reads that person on every document of the workspace and holds their connections in that workspace, and only them: the same person in another workspace is left alone. This is the one that closes a removed member in **every** document, whether the document is loaded or not. It carries the notice in the plan of each close. A demotion of an owner of the workspace is a revocation too: they lose the implicit `owner` on every document. Plan T4.1 names the removal of a member and the changes of access but not a change of a member's role; leaving it out would let a person who was just demoted keep writing, so it is included.
- A hand-over of a document by `removeMember` calls `documentChanged` for that document, so its owners, who have the access list open, are told it has a new line.

If the read fails (the database is down right after a commit), nothing is known about the person, and not knowing is not a reason to leave a connection as it was: every connection in the scope is closed with `4409`, and the reconnection's authentication decides, which fails as `unavailable` until the database is back. The failure is logged and the response is still the change's: the change committed and the caller has nothing to undo.

**The window.** Between the commit and the close there is the time of one query. An update that a connection sent in that window is applied, because the person still had the role when the connection received it. The rule the tests pin is the one after it: the connection is read-only from the instant it is closed (protocol §6.3, step 1), and a connection that authenticates later reads what the database says. Closing before the commit would shorten the window and break the rule of ADR 0011 §3, and it would close connections for a change that may still roll back.

### 3. A connection that is being established during a revocation

It is reached by the marks of ADR 0011 §3, which every call of `endConnections` leaves, and that is why `documentChanged` and `memberChanged` call it for every code even when no connection is live. The selector of a mark is evaluated again when the connection registers, against the facts read at the time of the change (`where(context, documentId)`; the document is now an argument so that one call can hold a person to what they hold on each document of a workspace). A connection that read its role before the commit has an old `role` in its context and differs, and is closed before any message of it is applied, with `4403` or `4409`. A connection that read after the commit has the new one and is left alone.

Two residues, both accepted:

- A connection that read after a commit but registers after the mark of an earlier change whose facts are older than what it read can be closed unnecessarily. It reconnects. The only case that costs more is a `4403` for a person who still has access, which needs a grant to be removed and given back within the time of one document load; it purges the local copy of that person, who can then fetch it again.
- The presence of the other people can reach a revoked connection before the close (ADR 0011 §3, known residue).

### 4. What this does not do

It does not recycle the connections of owners when a document is archived or restored (protocol §6.3, that is the archive's), and it ignores that difference: the mode of a connection is read from its role and the document's archived state now, so an owner on an archived document is left alone by a change of access. The session end is T7.1's.

## Consequences

- A person who is revoked at the moment they act is refused with the answer their role gives now, and nothing is written; this is pinned by tests that hold a revoking transaction open while the request queues behind it.
- The last owner of a workspace or a document cannot be lost by two changes at once.
- Every change of access costs a few more locks and, after the commit, one read of who holds what. A workspace with thousands of members and documents would feel the read of `memberChanged` (one row for each document); the MVP's workspaces do not.
- `endConnections` now passes the document to `where`.
- Pending members are not counted as owners (pending decision for the owner).

## Alternatives considered

- **Closing connections inside the transaction.** A connection being established would read the old role after the mark, and a rolled-back change would have closed people for nothing.
- **Deciding the codes from the change** (a grant removed is `4403`, a grant lowered is `4409`). The change does not know what the person still holds through the general access or the workspace, and a code that is wrong terminates the client's session on the document or leaves it writing. The comparison of modes is the only thing that is right in every case.
- **Closing every connection of the document or of the member with `4409` and letting authentication decide.** Always safe, and it is what happens when the read fails, but a person who is revoked would see "reconnecting" and a refusal as a connection problem and not the "access removed" screen, and the local copy would not be purged by the terminal code the protocol defines for it.
- **A queue of revocations in a table.** It would survive a crash between the commit and the close, and is not needed: after a restart there are no connections, and every new one reads the database.
