import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import * as Y from 'yjs'

/**
 * Gives the text blocks this editor creates their text node in the shared document, empty, in the transaction right
 * after the one that created them.
 *
 * `@tiptap/y-tiptap` writes a paragraph with no text as an element with no children and creates its `Y.XmlText` when the
 * first letter is typed. Two people who type in the same such paragraph at the same moment each create one, so the
 * paragraph holds two text nodes, which ProseMirror shows as one. The next edit of either makes y-tiptap fit the
 * shared text to the one it shows: it writes everything into the first node and deletes the second, so each person
 * deletes the other's letters and writes them again, and after the merge they are there twice (or, with other timings,
 * not at all). With a text node already in the paragraph both write into the same one, and Yjs keeps each person's run
 * whole.
 *
 * The fill is synchronous, inside `afterTransaction`, and that is what keeps it from ever being missing: Yjs sends
 * `update` after that event and encodes up to the end of the store, so the first update of an Enter already has the text
 * node. Only the creator of a block fills it: two people filling it would be the same race again. A block that someone
 * else made, or that the document had when it was opened, is left as it is, and nothing is written until a person edits
 * (the reason `trailingNode` is off). Blocks stored without a text node stay exposed until someone types in them; see
 * docs/decisions/0019-text-node-in-new-blocks.md.
 */
export const NewBlockText = Extension.create({
  name: 'newBlockText',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('newBlockText'),
        // The editor's view exists when the editor does, unlike the extension's `onCreate`, which runs a tick later.
        view: (view) => {
          // The document is the one `Collaboration` binds the editor to: without it there is nothing shared to fill.
          const document = ySyncPluginKey.getState(view.state)?.doc
          if (document === undefined) return {}
          const textBlocks = new Set(
            Object.values(view.state.schema.nodes).flatMap((type) => (type.isTextblock ? [type.name] : [])),
          )
          const fillNewBlocks = (transaction: Y.Transaction) => {
            // Only what this editor wrote: a change from the network or an undo is somebody else's to complete.
            if (transaction.origin !== ySyncPluginKey) return
            const empty = emptyBlocksCreatedBy(transaction, textBlocks)
            if (empty.length === 0) return
            document.transact(() => {
              for (const block of empty) block.insert(0, [new Y.XmlText()])
            }, ySyncPluginKey)
          }
          document.on('afterTransaction', fillNewBlocks)
          return { destroy: () => document.off('afterTransaction', fillNewBlocks) }
        },
      }),
    ]
  },
})

/**
 * The text blocks that this transaction created and that have nothing in them. The types that a transaction creates are
 * not in `transaction.changed`, and a list item made with its paragraph has the paragraph inside it, so they are read
 * from the structs the client wrote: its clock went from `beforeState` to `afterState`.
 */
function emptyBlocksCreatedBy(transaction: Y.Transaction, textBlocks: ReadonlySet<string>): Y.XmlElement[] {
  const { doc } = transaction
  const first = transaction.beforeState.get(doc.clientID) ?? 0
  const written = doc.store.clients.get(doc.clientID) ?? []
  const blocks: Y.XmlElement[] = []
  for (let index = written.length - 1; index >= 0; index--) {
    const struct = written[index]
    if (struct === undefined || struct.id.clock + struct.length <= first) break
    if (!(struct instanceof Y.Item) || struct.deleted || !(struct.content instanceof Y.ContentType)) continue
    const type = struct.content.type
    if (type instanceof Y.XmlElement && textBlocks.has(type.nodeName) && type.length === 0) blocks.push(type)
  }
  return blocks
}
