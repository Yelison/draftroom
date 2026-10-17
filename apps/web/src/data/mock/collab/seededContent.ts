import type { Schema } from '@draftroom/contract'
import { fragmentName } from '@draftroom/editor-schema'
// The mock plays the server, which writes the starting content of a document from JSON and never the client.
// oxlint-disable-next-line no-restricted-imports
import { replaceFragmentContent } from '@draftroom/editor-schema/convert'
import type { JSONContent } from '@tiptap/core'
import * as Y from 'yjs'
import { toBase64 } from '../../../collab/base64.ts'

/**
 * The anchor of the first occurrence of `quote` in the text of a document, made the way a client makes it (protocol
 * section 10.2): the start with `assoc = 0` at the first character, the end with `assoc = -1` after the last one.
 */
export function anchorOnText(doc: Y.Doc, quote: string): Schema<'Anchor'> {
  const find = (node: Y.XmlFragment | Y.XmlElement): Y.XmlText | null => {
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlText && child.toString().includes(quote)) return child
      if (child instanceof Y.XmlElement) {
        const inside = find(child)
        if (inside !== null) return inside
      }
    }
    return null
  }
  const text = find(doc.getXmlFragment(fragmentName))
  if (text === null) throw new Error(`"${quote}" is not in the document`)
  const index = text.toString().indexOf(quote)
  const encode = (position: Y.RelativePosition) => toBase64(Y.encodeRelativePosition(position))
  return {
    start: encode(Y.createRelativePositionFromTypeIndex(text, index, 0)),
    end: encode(Y.createRelativePositionFromTypeIndex(text, index + [...quote].length, -1)),
  }
}

/**
 * The client that wrote the starting content. A document that is written from JSON gets new ids for its text every time,
 * and a comment anchored in it names those ids, so the demo writes it as one fixed client: every tab, and every build,
 * holds the same items, and the anchors of the fixtures find them.
 */
const seedClientId = 2_026_101_317

export interface SeededContent {
  /** The Yjs update to start the document with. */
  update: Uint8Array
  /** The anchor of each quote that was asked for, made before the withdrawn text was deleted. */
  anchors: ReadonlyMap<string, Schema<'Anchor'>>
}

/**
 * The starting content of a document and the anchors of the comments on it. `withdrawn` is text that was there when a
 * comment was made and was deleted afterwards, the way someone else's edit would: its comment is orphaned from the start,
 * which is what a thread whose text is gone looks like.
 */
export function seedContent(
  blocks: readonly JSONContent[],
  { anchoredOn, withdrawn = [] }: { anchoredOn: readonly string[]; withdrawn?: readonly JSONContent[] },
): SeededContent {
  const doc = new Y.Doc()
  doc.clientID = seedClientId
  const fragment = doc.getXmlFragment(fragmentName)
  try {
    doc.transact(() => replaceFragmentContent(fragment, { type: 'doc', content: [...blocks, ...withdrawn] }))
    const anchors = new Map(anchoredOn.map((quote) => [quote, anchorOnText(doc, quote)]))
    if (withdrawn.length > 0) doc.transact(() => fragment.delete(blocks.length, withdrawn.length))
    return { update: Y.encodeStateAsUpdate(doc), anchors }
  } finally {
    doc.destroy()
  }
}
