import type { Schema } from '@draftroom/contract'

/** The day a document was archived. An archived document always has it; archiving stamps `updatedAt` with it all the same. */
export const archivedOn = (document: Schema<'Document'>) => document.archivedAt ?? document.updatedAt
