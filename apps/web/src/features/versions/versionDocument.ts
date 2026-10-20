import * as Y from 'yjs'

/** The Yjs document a stored update describes, or `null` when it is not an update this client can read. */
export function documentOf(update: Uint8Array): Y.Doc | null {
  const document = new Y.Doc()
  try {
    Y.applyUpdate(document, update)
    return document
  } catch {
    return null
  }
}
