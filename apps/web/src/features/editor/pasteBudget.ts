import { fragmentName } from '@draftroom/editor-schema'
import type { Schema, Slice } from '@tiptap/pm/model'
import { prosemirrorToYXmlFragment } from '@tiptap/y-tiptap'
import * as Y from 'yjs'

/**
 * The bytes of the Yjs update that inserting the content would produce (protocol section 12.5). Characters are a poor
 * measure: every node costs structs of its own, so a list of 35 000 short items is small as text and large as an update.
 * The content is written into a document of its own with the editor's schema and that is encoded.
 */
export function updateBytesOf(slice: Slice, schema: Schema): number {
  const scratch = new Y.Doc()
  try {
    // Not `createChecked`: a slice can be the middle of a structure and still be what the editor would insert.
    prosemirrorToYXmlFragment(schema.topNodeType.create(null, slice.content), scratch.getXmlFragment(fragmentName))
    return Y.encodeStateAsUpdate(scratch).byteLength
  } finally {
    scratch.destroy()
  }
}
