import { AUTO_VERSION_IDLE_MS, documentName, type StatelessEvent } from '@draftroom/contract/collab'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import type { Database } from '../db/tables.ts'
import { findUnexaminedStores, markExamined, type UnexaminedStore } from '../db/versions/auto.ts'
import { insertVersion } from '../db/versions/commands.ts'
import { newestAutoVersionAt, newestVersionState } from '../db/versions/queries.ts'
import { autoVersionSchedule } from '../domain/versions.ts'
import type { LiveDocuments } from '../http/live-documents.ts'
import type { DurabilityRegistry } from './durability.ts'
import type { CollabLog } from './log.ts'

// Automatic versions (protocol §11.2, ADR 0014). The rules are the domain's; this finds the documents they apply to and
// makes the versions. It works from what is stored, which survives a restart and covers a document nobody has open, and
// asks the live document only for what memory knows better: when it last changed, and what it holds now.

export interface AutoVersionsOptions {
  readonly database: Kysely<Database>
  readonly documents: LiveDocuments
  readonly durability: DurabilityRegistry
  /** Tells the connections of a document that its versions changed. */
  readonly broadcast: (documentId: string, event: StatelessEvent) => void
  readonly log: CollabLog
  readonly now: () => number
}

export interface AutoVersions {
  /** Looks at every document stored at least ten minutes ago that has not been looked at since, and says how many versions it made. */
  sweep(): Promise<number>
  /** Sweeps every `intervalMs` until `stop`. A sweep that is still running is not started again. */
  start(intervalMs: number): void
  stop(): void
}

const emptyState = Y.encodeStateAsUpdate(new Y.Doc())

/** Whether two states hold the same content: the same structs and the same deletions, which is what a snapshot is. */
function holdSameContent(first: Uint8Array, second: Uint8Array): boolean {
  const snapshotOf = (state: Uint8Array): Y.Snapshot => {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, state)
    return Y.snapshot(doc)
  }
  return Y.equalSnapshots(snapshotOf(first), snapshotOf(second))
}

export function createAutoVersions({
  database,
  documents,
  durability,
  broadcast,
  log,
  now,
}: AutoVersionsOptions): AutoVersions {
  let timer: NodeJS.Timeout | undefined
  let sweeping = false

  /** Makes the version this document is due, and says whether it did. */
  async function examine(store: UnexaminedStore, at: Date): Promise<boolean> {
    // A document someone has open may have changed since it was stored: the idle clock is the later of the two.
    const lastLiveChange = durability.get(documentName(store.documentId))?.lastChangeAt ?? 0
    const lastEditAt = new Date(Math.max(store.updatedAt.getTime(), lastLiveChange))

    // By time alone first: a document that is still waiting, which is most of the ones this finds, costs two small reads
    // and not the load and the decoding of its state and of its newest version. It stays unexamined, so the next sweep
    // decides again with whatever has happened by then.
    const newestAutoAt = await newestAutoVersionAt(database, store.workspaceId, store.documentId)
    if (!autoVersionSchedule({ now: at, lastEditAt, newestAutoAt }).due) return false

    return documents.withState(store.documentId, async (state) => {
      const newest = await newestVersionState(database, store.workspaceId, store.documentId)
      const edited = !holdSameContent(state, newest ?? emptyState)

      await database.transaction().execute(async (trx) => {
        if (edited) {
          await insertVersion(trx, {
            workspaceId: store.workspaceId,
            documentId: store.documentId,
            kind: 'auto',
            state,
            actorId: null,
          })
        }
        await markExamined(trx, store)
      })
      if (edited) broadcast(store.documentId, { type: 'versions-changed' })
      return edited
    })
  }

  async function sweep(): Promise<number> {
    const at = new Date(now())
    let made = 0
    for (const store of await findUnexaminedStores(database, new Date(at.getTime() - AUTO_VERSION_IDLE_MS))) {
      try {
        if (await examine(store, at)) made += 1
      } catch (error) {
        // One document that cannot be versioned must not stop the others, and is tried again at the next sweep.
        log.error({ documentId: store.documentId, error }, 'making an automatic version failed')
      }
    }
    return made
  }

  return {
    sweep,

    start(intervalMs) {
      timer = setInterval(() => {
        if (sweeping) return
        sweeping = true
        sweep()
          .catch((error: unknown) => log.error({ error }, 'looking for documents to version failed'))
          .finally(() => {
            sweeping = false
          })
      }, intervalMs)
      // The timer is not what keeps the process alive.
      timer.unref()
    },

    stop() {
      clearInterval(timer)
      timer = undefined
    },
  }
}
