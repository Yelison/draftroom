import { fragmentName } from '@draftroom/editor-schema'
import { InvalidDocumentError, yUpdateToJson } from '@draftroom/editor-schema/convert'
import * as Y from 'yjs'

// What may be stored (ADR 0011). A client that writes to the shared document is trusted with nothing: a pasted slice, a
// bug or a hand-made update can put a heading of a level the schema does not have, a `javascript:` link or a node it does
// not know into the Yjs state. The server's reader, `yUpdateToJson`, refuses all of those, and so the stored state is
// accepted only if that reader accepts it. A state it refuses is repaired by removing the top-level blocks it refuses.

/** Whether the schema's own reader can read this state. */
export function isReadable(state: Uint8Array): boolean {
  try {
    yUpdateToJson(state)
    return true
  } catch (error) {
    if (error instanceof InvalidDocumentError) return false
    throw error
  }
}

/**
 * Whether one top-level block is content the schema allows. A block is judged as the only block of a document, which is
 * what it is to the schema: the blocks of a document do not constrain each other.
 */
function isAllowedBlock(block: Y.XmlElement | Y.XmlText | Y.XmlHook): boolean {
  // A hook is a type of the Yjs XML model that the schema has no node for.
  if (block instanceof Y.XmlHook) return false
  const alone = new Y.Doc()
  try {
    alone.getXmlFragment(fragmentName).insert(0, [block.clone()])
    return isReadable(Y.encodeStateAsUpdate(alone))
  } finally {
    alone.destroy()
  }
}

/**
 * Removes from the document every top-level block the schema refuses, in one transaction, and says how many. It
 * deletes the whole block instead of mending it: the server does not know how to correct what a hostile client wrote,
 * and an honest editor never gets here, because its own content guard puts such content right before it is sent.
 *
 * The transaction is the server's (`source: 'local'`), and it asks for no store of its own: the store that called this
 * captures the repaired state right after.
 */
export function removeForbiddenBlocks(document: Y.Doc): number {
  const fragment = document.getXmlFragment(fragmentName)
  const refused: number[] = []
  fragment.toArray().forEach((block, index) => {
    if (!isAllowedBlock(block)) refused.push(index)
  })
  if (refused.length === 0) return 0
  document.transact(
    () => {
      // From the end, so the indexes still to delete do not move.
      for (const index of refused.toReversed()) fragment.delete(index, 1)
    },
    { source: 'local', skipStoreHooks: true },
  )
  return refused.length
}
