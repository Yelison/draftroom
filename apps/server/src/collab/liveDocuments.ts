import { documentName } from '@draftroom/contract/collab'
import type { Hocuspocus } from '@hocuspocus/server'
import { getVersion } from '../db/versions/queries.ts'
import type { Database } from '../db/tables.ts'
import { DocumentGoneError, type LiveDocuments } from '../http/live-documents.ts'
import type { Kysely } from 'kysely'
import type { ConnectionContext } from './context.ts'
import type { DurabilityRegistry } from './durability.ts'
import type { CollabLog } from './log.ts'
import { captureStorable } from './persistence.ts'
import { restoreVersion } from './restore.ts'
import type { RestoreVersions } from './restoreVersions.ts'
import type { StateStore } from './stateStore.ts'
import type { StoreRetry } from './storeRetry.ts'

export interface LiveDocumentsOptions {
  readonly hocuspocus: Hocuspocus<ConnectionContext>
  readonly database: Kysely<Database>
  readonly store: StateStore
  readonly durability: DurabilityRegistry
  readonly retry: StoreRetry
  readonly versions: RestoreVersions
  readonly log: CollabLog
}

/** What the REST routes need of documents that people may have open (protocol §11.3 and §11.4). */
export function createLiveDocuments({
  hocuspocus,
  database,
  store,
  durability,
  retry,
  versions,
  log,
}: LiveDocumentsOptions): LiveDocuments {
  return {
    async withState(documentId, task) {
      const document = hocuspocus.documents.get(documentName(documentId))
      const durable = document === undefined ? undefined : durability.get(document.name)
      if (document !== undefined && durable !== undefined) {
        // The state is captured as the store captures it, so that a version is always content the schema can read.
        return document.saveMutex.runExclusive(() => task(captureStorable(document, durable, log).state))
      }
      const state = await store.load(documentId)
      if (state === undefined) throw new DocumentGoneError(documentId)
      return task(state)
    },

    async restore(request) {
      const versionId = await restoreVersion({ hocuspocus, durability, retry, versions, log }, request)
      const restored = await getVersion(database, versionId)
      if (restored === undefined) throw new DocumentGoneError(request.documentId)
      return restored
    },
  }
}
