# 0019 · A text block the editor creates gets its text node at once

Status: proposed (2026-10-17, c07)

## Context

Two people who start typing at the same moment in a new paragraph of a shared document sometimes ended with letters that were typed once and are there twice, or are gone, and the server stored the result. The report that started the investigation was about two people's words ending up in one paragraph, one after the other (or in two paragraphs ordered by client). That part is how two people typing at the same point behave in any collaborative editor, and it is accepted: both see the same text and it is the stored one.

Measured against the real stack (two Chromium contexts, a new document, both typing at once with a delay of 0 to 30 ms per key), on the code before this decision:

| Scenario | Runs | Two paragraphs, texts whole | One paragraph, runs whole | Cut in the middle of a word | Letters added or lost |
| --- | --- | --- | --- | --- | --- |
| A new empty document | 18 | 9 | 7 | 2 | 0 |
| The paragraph already exists in Yjs (one person pressed Enter first) | 8 | 0 | 2 | 1 | 5 |

In both, the two browsers showed the same text and it matched `document_states`.

Making the server write an empty paragraph when it creates a document does not help: with it every run ended in one paragraph, and 7 of 10 had letters added or lost. A client that waits for `synced` before writing the first paragraph changes nothing, because the editor writes nothing when it opens (the fragment has no children until the first key) and the browsers already type after the handshake.

### Mechanism

`@tiptap/y-tiptap` 3.0.10 writes a paragraph with no text as an element with no children, and creates its `Y.XmlText` when the first letter is typed. Two people who type their first letter in the same such paragraph at the same moment each create a text node, and the paragraph holds two, which ProseMirror shows as one text. `normalizePNodeContent` maps a run of ProseMirror text nodes to a single `Y.XmlText`, so on the next edit `updateYFragment` writes the whole text into the first node and deletes the others. Each person therefore deletes the other's letters and writes them again, and after the merge each letter is there twice. With other timings the same rewrite loses letters.

The smallest case, with fixed client ids and the paragraph without a text node: `alice` types `B` and `bob` types `D` before either update arrives, they exchange updates (both show `BD`), `alice` types `e` between the letters and `bob` types `e` at the end, they exchange again and both show `BeDDe`. With a text node already in the paragraph, the four cases of that exchange keep every letter. It is reproducible with Tiptap's `Document`, `Paragraph`, `Text` and `Collaboration` alone, so the cause is in the library, not in the Draftroom schema. `3.0.10` is the latest release, and the `next` tag is older.

## Decision

1. **The editor gives a text block it creates its text node, empty, in the transaction after the one that created it** (`NewBlockText`, in `features/editor`). Two people typing in that block then write into the same `Y.XmlText`, and Yjs keeps each person's run whole.
2. **Only the creator fills it.** The extension acts on a transaction whose origin is the editor's own synchronisation and only on the blocks that transaction created, found from the structs the client wrote (a new list item with its paragraph, a paragraph made a heading or a list). It never acts on a change that comes from the network, from an undo, or from the content the document had when it was opened: a second party filling the same block would be the same race again, and a write at opening would be an update nobody typed, in a read-only document too (the reason `trailingNode` is off).
3. **The text node is written with the origin of the synchronisation**, so undoing the Enter that made the block undoes the block with its text node in one step, and the binding does not render it again.
4. **Nothing changes on the server, in the schema or in the protocol.** An empty text node inside a text block is the shape `y-tiptap` itself leaves when all the text of a block is deleted, and the server's reader (`yUpdateToJson`, which is what the stored state has to pass) accepts it in a paragraph, a heading and a list item.

## Consequences

- The case that lost or duplicated letters is closed: the unit test with the paragraph made by Enter and the end-to-end test against the real stack (ten runs in a row) keep every letter, once, the same on both screens and in the database.
- Typing in the same place at the same moment still gives each person's words one after the other, or one inside the other, as accepted above.
- An Enter takes two Yjs updates: the new block, and then its empty text node (measured in an empty document, where Enter makes two paragraphs: 66 bytes, then 27), sent one after the other from the same task. A person whose editor processes the first before the second and types in that gap would create a text node of their own; no run of the end-to-end test showed it, and it is the same situation as before the change for that one block. The second update counts as a local change like any other, so "Synced" still waits for the server's durable acknowledgement of both.
- The cost is one structural check on each local transaction, over the structs the client just wrote.

## Limits

- Blocks already stored without a text node (an empty paragraph from before this decision) stay exposed until someone types in them. Filling them when a document is opened would be a second party writing, which is what decision 2 rules out, and doing it on the server would write an update on every load.
- Content written by `replaceFragmentContent` (restoring a version) and by `jsonToYUpdate` (templates) goes through `prosemirrorToYXmlFragment`, which also leaves an empty block without a text node. The built-in templates have no empty blocks. A restored version that has one is exposed in the same way.
- The scripted collaborator of the demo writes into the text node of the last paragraph, not through the editor. After an Enter at the end of the document she found no text node in the new paragraph and waited; now she finds an empty one and waits because the person's cursor is in it. In both cases, with her script running for 30 simulated seconds, the new paragraph stays empty and she writes nothing in it, so the demo behaves as before.
- The library should handle sibling text nodes in `updateYFragment` itself. The minimal case above is ready to be sent to `@tiptap/y-tiptap`; when a release fixes it, `NewBlockText` can be removed together with its tests.

## Alternatives considered

- **The server stores an empty paragraph when it creates a document.** Rejected for the numbers above: it puts every first keystroke in one shared block and makes the duplicated letters the usual outcome. It would also leave the existing empty documents as they are.
- **The client writes the first paragraph only after `synced`, and only if the document is still empty.** The editor does not write one when it opens, and two clients that synchronise against the same empty state both see it empty.
- **A patch of `@tiptap/y-tiptap` through an override or `patch-package`.** It adds a dependency or touches the lockfile, and it would hide the fault instead of avoiding it.
- **Healing documents that already hold two text nodes in a block.** Merging them is deleting one and writing it again, so two people healing at the same time duplicate the letters again. Only a single party could do it safely.
