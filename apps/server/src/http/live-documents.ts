import type { VersionRecord } from '../db/versions/queries.ts'

/** The document has no state to take: it was deleted for good between the check of the request and the work. */
export class DocumentGoneError extends Error {
  constructor(documentId: string) {
    super(`The document ${documentId} has no state`)
    this.name = 'DocumentGoneError'
  }
}

/** The restore asked for gave up: people kept editing the document while it tried (protocol §11.4, step 5). */
export class RestoreConflictError extends Error {
  constructor(documentId: string) {
    super(`The document ${documentId} kept changing while a restore tried to replace it`)
    this.name = 'RestoreConflictError'
  }
}

export interface RestoreRequest {
  readonly versionId: string
  readonly workspaceId: string
  readonly documentId: string
  /** The owner who asked. */
  readonly actorId: string
}

/**
 * How the REST routes work on a document that people may have open, which only the collaboration server can do: its
 * live state is in memory, and nothing may write beside its store (protocol §11). The collaboration server implements it,
 * and the routes only know this, as they know `DocumentBroadcaster`, so they run with no WebSocket.
 */
export interface LiveDocuments {
  /**
   * Runs `task` with the state of the document as it is now. When somebody has the document open that is the state in
   * memory, which a store may not have written yet, and the task runs holding the document's store mutex, so no store,
   * restore or other version comes between the state and what the task writes. When nobody has it open it is the stored
   * state. Throws `DocumentGoneError` when there is none.
   */
  withState<Result>(documentId: string, task: (state: Uint8Array) => Promise<Result>): Promise<Result>

  /**
   * Replaces the content of the document with that of a version (protocol §11.4), keeping what it replaced in a
   * `pre-restore` version, and gives the `restore` version it made. It does not tell the connections of the document: the
   * route does, once this has returned. Throws `RestoreConflictError` when the document would not hold still.
   */
  restore(request: RestoreRequest): Promise<VersionRecord>
}
