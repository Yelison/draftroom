import { getSchema, type JSONContent } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { prosemirrorToYDoc, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { editorExtensions, fragmentName, headingLevels } from './extensions.ts'
import { isAllowedLinkHref } from './links.ts'

// Conversion between ProseMirror JSON and a Yjs update, for the server: it writes content it did not receive from an
// editor (a template, a restored version) and reads content to build an excerpt. The client never imports this module,
// because a client must never rebuild a document from JSON (plan, Global Constraints): it opens the stored Yjs state as
// it is. Nothing here needs a DOM, so it runs in Node.

const schema = getSchema(editorExtensions())

/** The JSON is not a document of this schema, or the stored content is not. `cause` has the library's own message. */
export class InvalidDocumentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidDocumentError'
  }
}

/**
 * The Yjs update of a new document with the given content, to store as its state.
 *
 * It refuses what the schema does not hold instead of dropping it, because its callers write content the product
 * authored and a silent loss would hide a mistake there: a node or mark that is not in the schema, content that breaks
 * a node's rules (text straight in the document, an empty document), a root that is not `doc`, a heading of a level the
 * schema does not have, and a link whose address is not allowed (`javascript:`, `data:`, a relative one…). Attributes the schema does not define are the exception:
 * they are left out, so what comes back is always the schema's own form.
 */
export function jsonToYUpdate(json: JSONContent): Uint8Array {
  const root = parse(json)
  const ydoc = prosemirrorToYDoc(root, fragmentName)
  try {
    return Y.encodeStateAsUpdate(ydoc)
  } finally {
    ydoc.destroy()
  }
}

function parse(json: JSONContent): Node {
  try {
    const root = schema.nodeFromJSON(json)
    if (root.type !== schema.topNodeType) {
      throw new RangeError(`The root is a ${root.type.name}, not a ${schema.topNodeType.name}`)
    }
    root.check()
    assertAllowed(root)
    return root
  } catch (error) {
    throw invalid(error, 'The JSON is not a document')
  }
}

/**
 * What the schema cannot say about a document that fits it. A heading made from JSON with no level has level 1, which
 * this schema has no heading for, and a link mark takes any text as its address: both are checked here, for the content
 * that is written and for the content that is read.
 */
function assertAllowed(root: Node) {
  root.descendants((node) => {
    if (node.type.name === 'heading' && !headingLevels.some((level) => level === node.attrs.level)) {
      throw new RangeError(
        `A heading has level ${String(node.attrs.level)}, and only ${headingLevels.join(' and ')} are allowed`,
      )
    }
    for (const mark of node.marks) {
      if (mark.type.name === 'link' && !isAllowedLinkHref(mark.attrs.href)) {
        throw new RangeError(`A link points to an address that is not allowed: ${String(mark.attrs.href)}`)
      }
    }
  })
}

const invalid = (error: unknown, fallback: string) =>
  new InvalidDocumentError(error instanceof Error ? error.message : fallback, { cause: error })

/**
 * The content of a stored Yjs state, as the schema writes it out. A state with no content yet reads as the single empty
 * paragraph the editor shows for it. A state that holds something the schema does not (a node from a schema that has
 * since changed, which the rules of this package should rule out) throws `InvalidDocumentError` rather than return
 * content the editor could not open.
 */
export function yUpdateToJson(update: Uint8Array): JSONContent {
  const ydoc = new Y.Doc()
  try {
    Y.applyUpdate(ydoc, update)
    const fragment = ydoc.getXmlFragment(fragmentName)
    if (fragment.length === 0) return { type: 'doc', content: [{ type: 'paragraph' }] }
    const root = yXmlFragmentToProseMirrorRootNode(fragment, schema)
    assertAllowed(root)
    return root.toJSON()
  } catch (error) {
    throw invalid(error, 'The stored content is not a document')
  } finally {
    ydoc.destroy()
  }
}
