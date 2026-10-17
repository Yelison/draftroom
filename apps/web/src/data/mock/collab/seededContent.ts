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
 * The client that wrote the starting content, which comes from a name (the language and the document). Text written from
 * JSON gets new ids every time, and a comment anchored in it names those ids, so the demo writes it as a client that is
 * always the same: every tab and every build hold the same items, and the anchors of the fixtures find them. A name of its
 * own for each language and document keeps two texts from sharing ids: a copy that a browser kept of one language, opened
 * in the other, would otherwise be taken for the same items and leave the two sides disagreeing about the text.
 */
function seedClientId(name: string): number {
  // FNV-1a, 32 bits: stable, and spread enough that two names do not meet. A client id is never 0.
  let hash = 0x811c9dc5
  for (const character of name) hash = Math.imul(hash ^ character.codePointAt(0)!, 0x01000193) >>> 0
  return hash === 0 ? 1 : hash
}

export interface SeededContent {
  /** The Yjs update to start the document with. */
  update: Uint8Array
  /** The anchor of each quote that was asked for, made before the withdrawn text was deleted. */
  anchors: ReadonlyMap<string, Schema<'Anchor'>>
}

/**
 * The starting content of a document and the anchors of the comments on it. `withdrawn` is text that was there when a
 * comment was made and was deleted afterwards, the way someone else's edit would: its comment is orphaned from the start,
 * which is what a thread whose text is gone looks like. `writtenBy` names who wrote it (see `seedClientId`).
 */
export function seedContent(
  blocks: readonly JSONContent[],
  {
    writtenBy,
    anchoredOn,
    withdrawn = [],
  }: { writtenBy: string; anchoredOn: readonly string[]; withdrawn?: readonly JSONContent[] },
): SeededContent {
  const doc = new Y.Doc()
  doc.clientID = seedClientId(writtenBy)
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
