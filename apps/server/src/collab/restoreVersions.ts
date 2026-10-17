import type { Kysely } from 'kysely'
import {
  commitRestore,
  discardPreRestoreVersion,
  savePreRestoreVersion,
  type PreRestoreVersion,
  type RestoredVersion,
} from '../db/versions/commands.ts'
import { readVersionState } from '../db/versions/queries.ts'
import type { Database } from '../db/tables.ts'

/**
 * What a restore keeps in the database (protocol §11.4), separate from the restore itself so that the sequence can be run
 * against a database that is slow, or that fails, without touching the sequence.
 */
export interface RestoreVersions {
  /** The Yjs update a version holds, or `undefined` when it does not exist. */
  readState(versionId: string): Promise<Uint8Array | undefined>
  /** Keeps what the restore is about to replace: the first time it is written, on every later pass it is overwritten. */
  savePreRestore(version: PreRestoreVersion): Promise<void>
  /** Takes back the `pre-restore` version of a restore that did not happen. */
  discardPreRestore(restoreId: string): Promise<void>
  /** Writes the `restore` version, its event and the document's state in one transaction, and gives the id of the version. */
  commit(restored: RestoredVersion): Promise<string>
}

export const postgresRestoreVersions = (database: Kysely<Database>): RestoreVersions => ({
  readState: (versionId) => readVersionState(database, versionId),
  savePreRestore: (version) => savePreRestoreVersion(database, version),
  discardPreRestore: (restoreId) => discardPreRestoreVersion(database, restoreId),
  commit: (restored) => commitRestore(database, restored),
})
