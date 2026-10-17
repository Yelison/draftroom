import { contractLimits, type Schema } from '@draftroom/contract'
import type { Node } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
  type ProsemirrorMapping,
} from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { fromBase64, toBase64 } from '../../collab/base64.ts'

type Anchor = Schema<'Anchor'>

/** A range of the text, in ProseMirror positions. */
export interface TextRange {
  from: number
  to: number
}

/** What an anchor is read against: the live Yjs document, its fragment and the sync binding's map to the editor's nodes. */
export interface BoundDocument {
  ydoc: Y.Doc
  fragment: Y.XmlFragment
  mapping: ProsemirrorMapping
}

/** The Yjs document an editor state is bound to, or `null` while the sync plugin has not bound one. */
export function boundDocumentOf(state: EditorState): BoundDocument | null {
  const sync = ySyncPluginKey.getState(state)
  if (sync === undefined) return null
  return { ydoc: sync.doc, fragment: sync.type, mapping: sync.binding.mapping }
}

/**
 * The anchor of a selection (protocol section 10.2). Text typed right before the range and right after it falls outside
 * it, so the range keeps covering the characters it covered. Anchors are stored: this recipe must never change without
 * a migration.
 */
export function createAnchor({ ydoc, fragment, mapping }: BoundDocument, from: number, to: number): Anchor {
  const positionAt = (position: number) => absolutePositionToRelativePosition(position, fragment, mapping)
  return {
    start: encode(startOf(ydoc, positionAt, from)),
    end: encode(positionAt(to)),
  }
}

/**
 * The helper makes every text position with `assoc = -1` and has no parameter to change it (protocol F12), but the start
 * is wanted with `assoc = 0`. The helper's position one character further, once its `assoc` is set to 0, is the same
 * position as one made with `assoc = 0` at `from` (F13).
 */
function startOf(ydoc: Y.Doc, positionAt: (position: number) => Y.RelativePosition, from: number): Y.RelativePosition {
  const here = positionAt(from)
  const next = positionAt(from + 1)
  const a = Y.createAbsolutePositionFromRelativePosition(here, ydoc)
  const b = Y.createAbsolutePositionFromRelativePosition(next, ydoc)
  const beforeACharacterOfTheSameText =
    a !== null && b !== null && a.type === b.type && a.type instanceof Y.XmlText && b.index === a.index + 1
  // At the end of a text node, or at a node boundary, there is no character to attach the start to: the helper's own
  // position stays (an accepted edge, pinned by tests).
  if (!beforeACharacterOfTheSameText) return here
  next.assoc = 0
  return next
}

/**
 * Where an anchor points in the text now, or `null` when it is orphaned: an end that does not decode or does not resolve,
 * or a range that collapsed (protocol section 10.3). The Yjs document is the truth, so this is read from it.
 */
export function resolveAnchor({ ydoc, fragment, mapping }: BoundDocument, anchor: Anchor): TextRange | null {
  try {
    const start = decode(anchor.start)
    const end = decode(anchor.end)
    if (start === null || end === null) return null
    const from = relativePositionToAbsolutePosition(ydoc, fragment, start, mapping)
    const to = relativePositionToAbsolutePosition(ydoc, fragment, end, mapping)
    return from === null || to === null || from >= to ? null : { from, to }
  } catch {
    // An anchor comes from another person's client: one that decodes into something the document cannot place must not
    // take the editor down with it, so it is a thread that points at nothing.
    return null
  }
}

/** The text a range covers, as the thread will quote it: a space where a block ends, cut at the contract's limit. */
export function quoteOf(doc: Node, from: number, to: number): string {
  const text = doc.textBetween(from, to, ' ')
  return [...text].slice(0, contractLimits.quote.max).join('')
}

const encode = (position: Y.RelativePosition) => toBase64(Y.encodeRelativePosition(position))

function decode(text: string): Y.RelativePosition | null {
  const bytes = fromBase64(text)
  return bytes === null ? null : Y.decodeRelativePosition(bytes)
}
