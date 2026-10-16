import { randomUUID } from 'node:crypto'
import { documentName } from '@draftroom/contract/collab'
import { fragmentName } from '@draftroom/editor-schema'
import { replaceFragmentContent, yUpdateToJson } from '@draftroom/editor-schema/convert'
import type { Document, Hocuspocus } from '@hocuspocus/server'
import * as Y from 'yjs'
import { RESTORE_CAPTURE_ATTEMPTS, RESTORE_COMMIT_ATTEMPTS } from '../domain/versions.ts'
import { DocumentGoneError, RestoreConflictError, type RestoreRequest } from '../http/live-documents.ts'
import type { ConnectionContext } from './context.ts'
import type { CapturedWrite, DocumentDurability, DurabilityRegistry } from './durability.ts'
import type { CollabLog } from './log.ts'
import { captureStorable } from './persistence.ts'
import type { RestoreVersions } from './restoreVersions.ts'
import { holdingStoreMutex, unloadIfAbandoned } from './storeMutex.ts'
import type { StoreRetry } from './storeRetry.ts'

// Restoring a version replaces the content of a document that people may be editing (protocol §11.4, ADR 0007, ADR 0014).
// The sequence is the protocol's, step by step; the comments say why each one is where it is.

/** The origin of the transaction that writes the restored content, so that it is told apart from what people type (protocol §13). */
export const RESTORE_ORIGIN = 'restore'

export interface RestoreDependencies {
  readonly hocuspocus: Hocuspocus<ConnectionContext>
  readonly durability: DurabilityRegistry
  readonly retry: StoreRetry
  readonly versions: RestoreVersions
  readonly log: CollabLog
}

/** Restores a version into its document and gives the id of the `restore` version it made. */
export async function restoreVersion(dependencies: RestoreDependencies, request: RestoreRequest): Promise<string> {
  const { hocuspocus, versions, log } = dependencies

  // Step 2: read the version and turn it into content in a throwaway document. A version that cannot be read ends the
  // restore here, with nothing touched: the live document is not opened yet.
  const state = await versions.readState(request.versionId)
  if (state === undefined) throw new DocumentGoneError(request.documentId)
  const content = yUpdateToJson(state)

  // Step 3: open the live document, which loads it when nobody has it. The handle is kept for the end.
  const connection = await hocuspocus.openDirectConnection(documentName(request.documentId))
  const document = connection.document
  if (document === null) throw new Error(`The direct connection to ${request.documentId} has no document`)
  try {
    const restoreId = randomUUID()
    // The whole sequence runs holding the store mutex, which is what keeps a store that captured the old state from
    // writing it after the restore and bringing the old content back. The mutex is released when this returns.
    return await holdingStoreMutex(hocuspocus, document, () =>
      replaceUnderMutex(dependencies, request, restoreId, document, content),
    )
  } finally {
    // Step 7: only now. `disconnect()` waits for a store, which takes the mutex: called while the restore still held it,
    // it would wait for the restore, which waits for it.
    await connection.disconnect().catch((error: unknown) => {
      log.error({ documentId: request.documentId, error }, 'closing the direct connection of a restore failed')
    })
    // The direct connection counted as a connection while the mutex was released, so the check made then found the document
    // in use; and `disconnect()` unloads only if nobody else holds the mutex at that moment.
    await unloadIfAbandoned(hocuspocus, document)
  }
}

type Content = ReturnType<typeof yUpdateToJson>

async function replaceUnderMutex(
  dependencies: RestoreDependencies,
  request: RestoreRequest,
  restoreId: string,
  document: Document,
  content: Content,
): Promise<string> {
  const { durability, versions } = dependencies
  const durable = durability.get(document.name)
  if (durable === undefined) throw new Error(`${document.name} is not tracked`)
  const restore = {
    restoreId,
    workspaceId: request.workspaceId,
    documentId: request.documentId,
    actorId: request.actorId,
  }

  let applied: CapturedWrite | undefined
  try {
    applied = await keepAndReplace(dependencies, restore, document, durable, content)
  } catch (error) {
    // Nothing was replaced, so there is no state it was the state before.
    await versions.discardPreRestore(restoreId).catch(() => undefined)
    throw error
  }
  if (applied === undefined) {
    await versions.discardPreRestore(restoreId)
    throw new RestoreConflictError(request.documentId)
  }
  return commitReplacement(dependencies, restore, document, durable, applied)
}

type RestoreIds = Pick<RestoreRequest, 'workspaceId' | 'documentId' | 'actorId'> & { readonly restoreId: string }

/**
 * Steps 4 and 5: keep what is about to be replaced, and replace it, in a way that nothing can come between the two.
 *
 * The `pre-restore` version is written from a capture, and writing it is the one `await` before the change. An edit that
 * arrives during it would be replaced and be in no version, so the change is made only if the document is still exactly
 * what was captured; the check and the change are one synchronous run. Otherwise the capture is taken again, a few times:
 * under continuous typing it can keep failing, and the owner is then told to try again (the caller's conflict).
 *
 * Gives the capture of the result, or `undefined` when every attempt found the document changed.
 */
async function keepAndReplace(
  { versions, log }: RestoreDependencies,
  restore: RestoreIds,
  document: Document,
  durable: DocumentDurability,
  content: Content,
): Promise<CapturedWrite | undefined> {
  for (let attempt = 1; attempt <= RESTORE_CAPTURE_ATTEMPTS; attempt += 1) {
    const before = captureStorable(document, durable, log)
    const beforeSnapshot = Y.snapshot(document)
    await versions.savePreRestore({ ...restore, state: before.state })

    if (!Y.equalSnapshots(Y.snapshot(document), beforeSnapshot)) continue
    // On the document itself, never through `DirectConnection.transact`: the origin is what clients and the undo manager
    // tell a restore by.
    document.transact(() => replaceFragmentContent(document.getXmlFragment(fragmentName), content), RESTORE_ORIGIN)
    return captureStorable(document, durable, log)
  }
  return undefined
}

/**
 * Step 6: write what the restore changed. The content is already restored in memory and sent to the editors, so if the
 * database keeps refusing, the store retry of protocol §7.2 persists it; what is lost is the `restore` version, and the
 * owner is told the restore failed.
 */
async function commitReplacement(
  { versions, retry, hocuspocus, log }: RestoreDependencies,
  restore: RestoreIds,
  document: Document,
  durable: DocumentDurability,
  applied: CapturedWrite,
): Promise<string> {
  let failure: unknown
  for (let attempt = 1; attempt <= RESTORE_COMMIT_ATTEMPTS; attempt += 1) {
    try {
      const versionId = await versions.commit({ ...restore, state: applied.state })
      // The database holds the state that was captured, and only that: what was typed since is still to be stored.
      durable.commit(applied)
      retry.succeeded(document.name)
      return versionId
    } catch (error) {
      failure = error
      log.warn({ documentId: restore.documentId, attempt, error }, 'writing a restore failed')
    }
  }
  retry.failed(hocuspocus, document)
  throw failure
}
