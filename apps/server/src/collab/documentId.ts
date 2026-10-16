import { parseDocumentName } from '@draftroom/contract/collab'

/** The id in a document name that already passed authentication, which refuses every name that is not canonical. */
export function documentIdOf(documentName: string): string {
  const documentId = parseDocumentName(documentName)
  if (documentId === null) throw new Error(`Not a document name: ${documentName}`)
  return documentId
}
