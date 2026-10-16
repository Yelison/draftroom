import type { Kysely, Transaction } from 'kysely'
import { versionActivity } from '../../domain/versions.ts'
import { recordActivity } from '../activity.ts'
import { writeDocumentState } from '../documents/state.ts'
import type { Database, VersionKind } from '../tables.ts'

// The writes of versions. A version that people can see in the history (a saved one, an automatic one, the result of a
// restore) is written in a transaction with its event, so neither exists alone. The version a restore keeps of what it
// replaced is the one exception: it is not in the history, and is written on its own, before the content changes.

export interface NewVersion {
  readonly workspaceId: string
  readonly documentId: string
  readonly kind: Exclude<VersionKind, 'pre-restore'>
  readonly state: Uint8Array
  readonly label?: string
  /** The person who asked for it, or `null` when the server made it on its own. */
  readonly actorId: string | null
  /** The restore a `restore` version is the result of. */
  readonly restoreId?: string
}

/** Saves a version and records that it exists. Gives its id. */
export async function insertVersion(trx: Transaction<Database>, version: NewVersion): Promise<string> {
  const { id } = await trx
    .insertInto('document_versions')
    .values({
      workspace_id: version.workspaceId,
      document_id: version.documentId,
      kind: version.kind,
      label: version.label ?? null,
      created_by: version.actorId,
      state: version.state,
      restore_id: version.restoreId ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await recordVersionActivity(trx, version)
  return id
}

async function recordVersionActivity(
  trx: Transaction<Database>,
  version: Pick<NewVersion, 'workspaceId' | 'documentId' | 'kind' | 'actorId'>,
): Promise<void> {
  const type = versionActivity(version.kind)
  if (type === null) return
  await recordActivity(trx, [
    { workspaceId: version.workspaceId, documentId: version.documentId, type, actorId: version.actorId },
  ])
}

export interface PreRestoreVersion {
  readonly restoreId: string
  readonly workspaceId: string
  readonly documentId: string
  readonly actorId: string
  /** What the restore is about to replace. */
  readonly state: Uint8Array
}

/**
 * Keeps the state a restore is about to replace, as the one `pre-restore` version of that restore: written the first time
 * it is asked, and overwritten on every later pass, so a restore that has to look again leaves one version and not one for
 * each look.
 */
export async function savePreRestoreVersion(db: Kysely<Database>, version: PreRestoreVersion): Promise<void> {
  await db
    .insertInto('document_versions')
    .values({
      workspace_id: version.workspaceId,
      document_id: version.documentId,
      kind: 'pre-restore',
      created_by: version.actorId,
      state: version.state,
      restore_id: version.restoreId,
    })
    .onConflict((conflict) =>
      conflict
        .columns(['restore_id', 'kind'])
        .where('restore_id', 'is not', null)
        .doUpdateSet((eb) => ({ state: eb.ref('excluded.state') })),
    )
    .execute()
}

/** Takes back the `pre-restore` version of a restore that did not happen: there is nothing it was the state before. */
export async function discardPreRestoreVersion(db: Kysely<Database>, restoreId: string): Promise<void> {
  await db
    .deleteFrom('document_versions')
    .where('restore_id', '=', restoreId)
    .where('kind', '=', 'pre-restore')
    .execute()
}

export interface RestoredVersion {
  readonly restoreId: string
  readonly workspaceId: string
  readonly documentId: string
  readonly actorId: string
  /** The state the document has once the version's content is in it. */
  readonly state: Uint8Array
}

/**
 * Writes what a restore changed, in one transaction: the `restore` version, the event of the history and the state of the
 * document. Gives the id of the version.
 *
 * It can be asked again for the same restore, which is what makes retrying it safe: a version already written for it is
 * the one given back, and no second one and no second event is added.
 */
export async function commitRestore(db: Kysely<Database>, restored: RestoredVersion): Promise<string> {
  return db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto('document_versions')
      .values({
        workspace_id: restored.workspaceId,
        document_id: restored.documentId,
        kind: 'restore',
        created_by: restored.actorId,
        state: restored.state,
        restore_id: restored.restoreId,
      })
      .onConflict((conflict) =>
        conflict.columns(['restore_id', 'kind']).where('restore_id', 'is not', null).doNothing(),
      )
      .returning('id')
      .executeTakeFirst()
    if (inserted !== undefined) {
      await recordVersionActivity(trx, { ...restored, kind: 'restore' })
    }
    await writeDocumentState(trx, restored.documentId, restored.state)
    if (inserted !== undefined) return inserted.id
    const { id } = await trx
      .selectFrom('document_versions')
      .select('id')
      .where('restore_id', '=', restored.restoreId)
      .where('kind', '=', 'restore')
      .executeTakeFirstOrThrow()
    return id
  })
}
