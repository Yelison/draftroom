import type { Schema } from '@draftroom/contract'

type ActivityType = Schema<'ActivityType'>

/**
 * The Yjs state of a document nobody has typed in yet: an update with no structs and an empty delete set. It is what
 * `Y.encodeStateAsUpdate` gives for an empty `Y.Doc`, and what `@draftroom/editor-schema` reads as the one empty
 * paragraph the editor shows. The collaboration server replaces it the first time someone edits.
 */
export const emptyDocumentState: Uint8Array = Uint8Array.of(0, 0)

export interface DocumentMetadata {
  readonly title: string
  readonly folderId: string | null
}

export interface MetadataPatch {
  readonly title?: string | undefined
  readonly folderId?: string | null | undefined
}

/** What a patch changes about a document, and so what history records. A field sent with its current value changes nothing. */
export function metadataChanges(current: DocumentMetadata, patch: MetadataPatch): readonly ActivityType[] {
  const renamed = patch.title !== undefined && patch.title !== current.title
  const moved = patch.folderId !== undefined && patch.folderId !== current.folderId
  return [...(renamed ? (['document.renamed'] as const) : []), ...(moved ? (['document.moved'] as const) : [])]
}
