import { getSchema, type JSONContent } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { prosemirrorToYDoc, prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { attributeProblem } from './attributes.ts'
import { editorExtensions, fragmentName } from './extensions.ts'
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

/**
 * Makes a live fragment hold this content, by comparing the two and changing only what differs, so a node the content
 * keeps is the same node afterwards: an edit that someone makes to it meanwhile, and a comment anchored in it, stay where
 * they are. Deleting everything and writing it again would give every node a new identity, and a Yjs type cannot be moved
 * from one document to another, so the content is written into the fragment itself.
 *
 * The caller owns the transaction, and so its origin: wrap the call in `doc.transact(…, origin)`. Only the fragment is
 * written; no other root of the document is touched. The content is checked as `jsonToYUpdate` checks it, before anything
 * is written, so a refusal leaves the fragment as it was.
 */
export function replaceFragmentContent(fragment: Y.XmlFragment, json: JSONContent): void {
  prosemirrorToYXmlFragment(parse(json), fragment)
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
 * What the schema cannot say about a document that fits it: attributes it gives a default and no limit (a heading made
 * from JSON with no level has level 1, a list can start anywhere) and a link mark's address, which takes any text. Checked
 * for the content that is written and for the content that is read.
 */
function assertAllowed(root: Node) {
  root.descendants((node) => {
    const problem = attributeProblem(node.type.name, node.attrs)
    if (problem !== null) throw new RangeError(problem)
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
