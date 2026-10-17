import { jsonToYUpdate, yUpdateToJson } from '@draftroom/editor-schema/convert'
import { excerptOf } from './excerpt.ts'

/** What a copy of a document starts with: the content and nothing that editing left around it. */
export interface ContentCopy {
  /** The Yjs update to store as the state of the new document. */
  readonly state: Uint8Array
  readonly excerpt: string | null
}

/**
 * The content of a stored state as the state of a new document, built from the content the way a template is. Only the
 * text and structure cross over: the map of position migrations that structural edits leave in the original is not
 * content, and a copy that kept it would be as large as the original it is the way out of.
 *
 * Rebuilding from JSON is safe here because the result is a different document: nobody has an anchor, an offline copy or
 * a connection to it. The rule against it protects the same document.
 *
 * Throws `InvalidDocumentError` when the editor schema cannot read the state, as the reader of ADR 0011 refuses it.
 */
export function copyOfContent(state: Uint8Array): ContentCopy {
  const content = yUpdateToJson(state)
  return { state: jsonToYUpdate(content), excerpt: excerptOf(content) }
}
