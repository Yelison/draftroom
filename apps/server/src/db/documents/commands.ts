import { sql, type Kysely, type Transaction } from 'kysely'
import { emptyDocumentState } from '../../domain/documents.ts'
import { recordActivity } from '../activity.ts'
import type { ActivityType, Database } from '../tables.ts'

// The writes to a document's metadata. Each one that changes the document also appends its event to the history; the
// callers run them in a transaction, and the ones that need one say so in their signature.

export interface NewDocument {
  readonly workspaceId: string
  readonly title: string
  readonly folderId: string | null
  readonly createdBy: string
}

/**
 * Creates a document: its row, its empty content, its creator's `owner` grant and the event that says it was created,
 * all or nothing. Sharing starts closed (`general_access` is `none` by default), and the creator is the only owner.
 */
export async function createDocumentRows(trx: Transaction<Database>, document: NewDocument): Promise<string> {
  const { id } = await trx
    .insertInto('documents')
    .values({
      workspace_id: document.workspaceId,
      title: document.title,
      folder_id: document.folderId,
      created_by: document.createdBy,
      archived_at: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await trx
    .insertInto('document_states')
    .values({ workspace_id: document.workspaceId, document_id: id, state: emptyDocumentState })
    .execute()
  await trx
    .insertInto('document_access')
    .values({ workspace_id: document.workspaceId, document_id: id, user_id: document.createdBy, role: 'owner' })
    .execute()
  await recordActivity(trx, [
    { workspaceId: document.workspaceId, documentId: id, type: 'document.created', actorId: document.createdBy },
  ])
  return id
}

export interface MetadataUpdate {
  readonly documentId: string
  readonly workspaceId: string
  readonly actorId: string
  /** The revision the caller read: the write only happens if the document still has it. */
  readonly revision: number
  readonly title?: string | undefined
  readonly folderId?: string | null | undefined
  /** What this change is, for the history: the domain says it from the document and the patch. */
  readonly events: readonly ActivityType[]
}

/** Writes the change if the document is still at `revision`, and says whether it was. One statement checks and writes. */
export async function updateMetadata(trx: Transaction<Database>, update: MetadataUpdate): Promise<boolean> {
  const updated = await trx
    .updateTable('documents')
    .set((eb) => ({
      ...(update.title === undefined ? {} : { title: update.title }),
      ...(update.folderId === undefined ? {} : { folder_id: update.folderId }),
      revision: eb('revision', '+', 1),
      updated_at: sql`now()`,
    }))
    .where('id', '=', update.documentId)
    .where('revision', '=', update.revision)
    .returning('id')
    .executeTakeFirst()
  if (updated === undefined) return false
  await recordActivity(
    trx,
    update.events.map((type) => ({
      workspaceId: update.workspaceId,
      documentId: update.documentId,
      type,
      actorId: update.actorId,
    })),
  )
  return true
}

export interface ArchiveChange {
  readonly documentId: string
  readonly workspaceId: string
  readonly actorId: string
  readonly archive: boolean
}

/**
 * Archives or restores a document, and says whether it changed: a document already in that state is left as it is,
 * with its revision, which is what makes both operations idempotent.
 */
export async function setArchived(trx: Transaction<Database>, change: ArchiveChange): Promise<boolean> {
  const updated = await trx
    .updateTable('documents')
    .set((eb) => ({
      archived_at: change.archive ? sql`now()` : null,
      revision: eb('revision', '+', 1),
      updated_at: sql`now()`,
    }))
    .where('id', '=', change.documentId)
    .where('archived_at', change.archive ? 'is' : 'is not', null)
    .returning('id')
    .executeTakeFirst()
  if (updated === undefined) return false
  await recordActivity(trx, [
    {
      workspaceId: change.workspaceId,
      documentId: change.documentId,
      type: change.archive ? 'document.archived' : 'document.restored',
      actorId: change.actorId,
    },
  ])
  return true
}

/**
 * Deletes an archived document for good: its content, grants, pins and history go with it. It says whether it did: a
 * document restored in the meantime is not deleted.
 */
export async function deleteArchivedDocument(db: Kysely<Database>, documentId: string): Promise<boolean> {
  const deleted = await db
    .deleteFrom('documents')
    .where('id', '=', documentId)
    .where('archived_at', 'is not', null)
    .returning('id')
    .executeTakeFirst()
  return deleted !== undefined
}

export interface Pin {
  readonly workspaceId: string
  readonly documentId: string
  readonly userId: string
}

export async function pinDocument(db: Kysely<Database>, pin: Pin): Promise<void> {
  await db
    .insertInto('pins')
    .values({ workspace_id: pin.workspaceId, document_id: pin.documentId, user_id: pin.userId })
    .onConflict((conflict) => conflict.columns(['user_id', 'document_id']).doNothing())
    .execute()
}

export async function unpinDocument(db: Kysely<Database>, documentId: string, userId: string): Promise<void> {
  await db.deleteFrom('pins').where('document_id', '=', documentId).where('user_id', '=', userId).execute()
}
