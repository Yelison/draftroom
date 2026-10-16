# 0011 · The collaboration server: what may be stored, and how the position-migration map grows

Status: proposed (2026-10-16, with the collaboration server)

## Context

The collaboration protocol leaves two things open for T2.1 (§1 and §2 of `docs/collab/protocol.md`):

- **What may be stored.** A client that writes to the shared document is trusted with nothing. A pasted ProseMirror slice, a bug or a hand-made update can put a heading of a level the schema does not have, a link to `javascript:`, a node or mark the schema does not know, text straight under the document, or a paragraph inside a paragraph into the Yjs state. The content guard of `@draftroom/editor-schema` puts the first two right in an honest editor before anything is sent, but the server cannot rely on that. What it stores is read later by the server itself (versions, restore, the excerpt) and by every other client, so content the schema refuses must never reach `document_states`.
- **The map `__tiptap_position_migrations:root:default`.** `@tiptap/y-tiptap` 3.0.10 writes an entry into it on structural edits and never deletes one. The protocol says the server keeps it exactly as clients write it (never filters it, never clears it) and asks T2.1 to measure its growth in a realistic session.

## Decision

### 1. The stored state is accepted only if the schema's reader accepts it; if not, the blocks it refuses are removed first

At every store (`onStoreDocument`, inside the document's store mutex), the server captures the state and asks `yUpdateToJson` from `@draftroom/editor-schema` to read it. That function is the schema's own reader: it refuses an unknown node or mark, a heading level outside `headingLevels`, a numbered list that starts at a number nobody types, a link whose address is not allowed, text straight under the document and content that breaks a node's rules. (A probe of each of these, written into a `Y.Doc` as a hand-made client would, found all of them refused; an attribute the schema does not define is not refused, it is left out when the state is read.)

When the reader refuses the state, the server judges the top-level blocks one by one, each as the only block of a document, and deletes the ones that are refused in a transaction of its own (`source: 'local'`, `skipStoreHooks: true`, so it asks for no store of its own and is captured by the one that is running). It then captures again and reads again; a state that is still refused is not written, the write fails and the retry loop of ADR 0006 tries again. The repair is a normal Yjs update: it reaches every connected client, and the `stored` snapshot, taken after it, covers whatever the author sent (a deleted block is still in the delete set).

What the decision costs and does not cover:

- **Cost.** Reading the state is the only per-store work, and a store happens at most once per second per document, whatever the rate of messages and the number of editors. Measured with the editor of the product in jsdom (the sessions of decision 2): 7 ms for a state of 75 KB, 11 ms for 170 KB, 21 ms for 370 KB, 93 ms for 1.6 MB, and about 50 ms for 590 KB of plain text. At the limit of 5 MiB it is the order of a third of a second, once a second, for a document that is being edited all the time. When nothing is refused, nothing else is done.
- **Exposure.** Content the schema refuses can be in memory, and in the browsers of the people connected, for up to one store window (1 to 5 seconds) before the repair removes it. It is never in the database, not even for a moment, because the check runs before the capture that is written. What the connected editors do meanwhile depends on the content: a link to an address the schema does not allow is drawn with its `href` emptied (Tiptap's link mark does it), and the binding of `@tiptap/y-tiptap` 3.0.10 refuses to project a node the schema does not have or content that breaks a node's rules (it sets a `projectionError`, keeps showing the previous content and writes nothing back) until the repair, which is a normal update, makes the shared content projectable again. T2.2 should therefore show nothing alarming for that state, and never treat it as the person's own error.
- **Granularity.** The repair removes the whole top-level block. The server does not know how to correct what a hostile client wrote, and an honest editor never gets here. A block that holds both someone's concurrent honest edit and the forbidden content loses both; that is the price of not guessing.
- **Not covered.** Two valid concurrent edits can merge into a tree that breaks a node's rules without any message being at fault. They are handled by the same check, as whatever the reader refuses, but they are indistinguishable from a forged update; no merge was found that the reader refuses, and none was looked for exhaustively. A violation that spans two blocks cannot exist, because the blocks of a document do not constrain each other.
- **Who.** The server logs that it removed content (the document and how many blocks). It does not say whose update it was, since a Yjs update does not carry its author's identity after it is merged; T4.1 or T7.2 can add a connection-level record if auditing is wanted.

### 2. The migration map is kept as clients write it, and its growth is recorded here

The map is written by the binding of `@tiptap/y-tiptap` when a ProseMirror transaction moves characters or nodes between nodes of the document (`applyPositionMigration`): pressing Enter, joining paragraphs, changing a paragraph into a heading or a list, indenting and lifting list items, pasting blocks and deleting a selection that spans nodes. Typing and deleting inside one text node writes nothing. Each entry is keyed by `clientID:clock` and holds the state vector of the writer at that moment (`seen`) and the list of transfers.

How it was measured: a script outside the repository, which is a measurement and not code the product uses, builds the real editor of the product (`editorExtensions()` of `@draftroom/editor-schema` and `Collaboration` from Tiptap 3.31.4) in jsdom for each client, relays every Yjs update between them as the server would, and drives them with a seeded generator of operations (typing words, Enter, joining backwards, toggling headings, lists, indenting, bold, pasting two blocks, deleting a selection). It starts from twelve paragraphs. The size of the map is the length of the Yjs update of a document that holds only a copy of it, so it is what the entries cost in the state; the total is `Y.encodeStateAsUpdate` of the whole document.

| Session                                                                    | Operations | Structural edits | Entries | Map (KB) | State (KB) | Map's share | Per entry (KB) |
| -------------------------------------------------------------------------- | ---------: | ---------------: | ------: | -------: | ---------: | ----------: | -------------: |
| Typing only, 3 clients                                                     |      1 000 |                0 |       0 |      0.0 |         34 |          0% |              - |
| Prose-heavy (90% typing, 8% structural), 3 clients                         |      2 000 |              170 |     122 |      303 |        369 |         82% |            2.5 |
| Mixed (35% structural), 1 client                                           |      1 000 |              366 |     295 |      458 |        515 |         89% |            1.6 |
| Mixed, 3 clients                                                           |      1 000 |              366 |     176 |      221 |        248 |         89% |            1.3 |
| Mixed, 5 clients                                                           |      1 000 |              366 |     294 |      396 |        430 |         92% |            1.3 |
| Structural edits only, 3 clients                                           |      1 000 |            1 000 |     566 |      703 |        737 |         95% |            1.2 |
| Mixed, 30 sessions of 100 operations, a new client id for each (1 client)  |      3 000 |            1 047 |     835 |    1 536 |      1 609 |         96% |            1.8 |

What it shows:

- **The map dominates the state.** Once a document has had structural edits, 80% to 96% of its bytes are the map, and the text is a small part of the rest. A structural edit costs 0.6 to 1.8 KB, whatever the mix of the session.
- **An entry grows with the number of Yjs client ids the document has ever had**, because it stores the writer's whole state vector. Every page load and every reconnection that makes a new `Y.Doc` is a new client id: after 30 sessions the entries cost 1.8 KB against 1.2 KB after five.
- **The limit is reachable.** At 0.6 to 1.8 KB per structural edit, `MAX_DOCUMENT_STATE_BYTES` (5 MiB) is reached after roughly 3 000 to 9 000 structural edits in one document, from all its editors together, and sooner with many sessions. A document edited by several people over weeks gets there.
- **Past the limit the document cannot come back down by editing.** The map is never deleted, so deleting text does not shrink it (§5.2 says the way down from an oversized document is to delete content), and a restore replaces only the fragment `default` (§2, §11.4). Writes that add content are refused, and typing a character adds content. Reading, and deleting, keep working.
- **Reading the state scales with it** (decision 1): 93 ms at 1.6 MB.

The protocol's rule stands for T2.1: the server never filters the map, clears it or converts it, because the entries are what lets a relative position, and so a comment anchor, keep its place across a structural edit (F12, §10). Nothing in this task removes an entry. The measurement is the input to a decision that belongs to the owner, before the first long-lived document and before T3.2 relies on anchors:

| Option                                                          | What it costs                                                                                                                                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raise `MAX_DOCUMENT_STATE_BYTES`                                | A change to the contract (`packages/contract`, so a block for T2.1). It postpones the wall by the factor it raises, it does not remove it, and it makes every load, store and read heavier.        |
| Remove entries that no relative position can still need          | The server cannot know which positions exist: anchors are stored by the REST API as opaque values (§10.1) and presence is ephemeral. It needs a rule agreed with comments (for example, entries older than the oldest stored anchor), and it changes the protocol's §2. |
| Ask for an option in `@tiptap/y-tiptap` to bound or drop old entries | Not in 3.0.10 (nothing in the binding or the plugin turns it off). A dependency change outside this task.                                                                                     |
| A new document built from the content ("compact")               | The one thing the rules forbid: a Yjs document is never rebuilt from JSON, and every comment anchor and offline copy would be orphaned.                                                              |
| Do nothing                                                      | A document that is edited enough ends read-only for additions with a "too large" message and little text in it.                                                                                     |

## Consequences

- A document with forbidden content is repaired, logged and stored; nothing forbidden is ever in `document_states`. Tests pin it with one case for each way in (a level 1 and a level 4 heading, an unknown node, an unknown mark, a `javascript:` link, text under the document, a paragraph in a paragraph, a list that starts at `1e20`), and compare every state the database was given.
- The server's per-store cost is proportional to the size of the state. It is small for the documents of the MVP, and it grows with the map.
- The size of a document is not the size of its text. The "too large" state of §5.2 is reachable through structural editing alone, and it is an open decision for the owner (above), not something T2.1 fixes.

## Alternatives considered

For decision 1:

- **Validate every incoming update before applying it** (a candidate document made from the state plus the update, read with `yUpdateToJson`). Exact and simple, but it costs the whole state per message: about 70 ms for 590 KB, so at the rate limit of 100 messages a second one editor can occupy the event loop of the server for everyone, and ordinary typing by a few people costs a large share of a core.
- **Reject a message with forbidden content by closing the connection.** The contract has no code or event for it. `4413` would say the document is too large, which is false. A code outside the contract is a contract change. And the client would reconnect and send the same pending change again, in a loop.
- **Drop it silently.** The author is acknowledged with `SyncStatus(true)` or not at all, and shows "Synchronising" for ever: the reasoning of §5.2.
- **Recognise what is risky from the structure of the update** (`Y.decodeUpdate`, looking at the kind of each new item, so that plain text typing skips the check). It would make the common case free, but the parent of an item is left out of an update when it can be derived from its neighbours, so a string inserted where only an element may go cannot be told from typing without the document. Unsound against a hand-made update.
- **Validate on the types a transaction changed** (`transaction.changed`) and repair only those. Proportional to the change instead of the document, and a good next step if the cost of reading the state matters. It needs the rules of the schema for one block, which `@draftroom/editor-schema` does not export (only the reader of a whole update), and a client id is not enough to say which block an attribute belongs to without the document. Not done now: the cost of reading the state is bounded by one store a second.
- **Mend instead of remove** (clamp the level, drop the mark). The server would have to know the correction for each rule, and a wrong one writes the server's guess into someone's document.
- **Refuse to write and leave the document as it is.** The forbidden content then stays in memory for as long as the document is loaded, every later store fails the same way, and nothing of the other editors' work is stored: one editor stops persistence for all.
- **`gc: false`**, to keep a way back to the content before the update. Rejected in ADR 0007 for its cost in memory and storage, which this does not change.

For decision 2, the options are in the table above. The cheapest of them, measuring more, is done: the script and its seed are described here and can be rerun against another version of `@tiptap/y-tiptap` when the dependency changes.
