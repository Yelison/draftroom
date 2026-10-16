import { IndexeddbPersistence, clearDocument } from 'y-indexeddb'
import * as Y from 'yjs'

/**
 * The copy of a document that this device keeps (protocol section 12.1): `y-indexeddb` behind a thin wrapper, so the
 * library can be swapped without touching the session. A copy is only the person's own working memory. It is never
 * "saved": only the server's durable acknowledgement says that.
 */

/** Which copy: one per account, workspace and document, only for documents the person opened. */
export interface CopyKey {
  readonly userId: string
  readonly workspaceId: string
  readonly documentId: string
}

/** The closing colon is part of the prefix: the copies of `u1` are not the copies of `u10`. */
export const accountPrefix = (userId: string): string => `draftroom:${userId}:`

export const copyName = ({ userId, workspaceId, documentId }: CopyKey): string =>
  `${accountPrefix(userId)}${workspaceId}:${documentId}`

// The marker lives in the copy itself (in the store `y-indexeddb` keeps for what is not an update), so deleting the copy
// deletes it and it can never outlive what it describes.
const UNSYNCED = 'unsynced'
const CUSTOM_STORE = 'custom'
const UPDATES_STORE = 'updates'
const MARKED = 1

/** Storage that never answers (blocked, or a failed open) must not keep the person from the document. */
export const LOAD_TIMEOUT_MS = 3_000

/**
 * A copy that is open: the document it follows and the marker of what was never stored. The copy sets the marker itself,
 * with every change of the person (see `PersistedCopy`); what it is told is what the server stored.
 */
export interface LocalCopy {
  /** The copy held content when it was opened: there is something to show before any connection. */
  readonly hadContent: boolean
  /** The marker was set when it was opened: changes of this device that the server was not shown to have stored. */
  readonly hadUnstoredChanges: boolean
  /** The server stored this much: the marker goes if the snapshot contains everything the copy holds. */
  settle(snapshot: Y.Snapshot): Promise<void>
  /** Stops following the document; the copy stays on the device. */
  close(): void
  /** Stops following the document and deletes the copy. */
  purge(): Promise<void>
}

const openCopies = new Set<PersistedCopy>()
const deletions = new Map<string, Promise<void>>()

/**
 * The copy is a database every tab of the account shares, so it is the copy, and not the session, that knows whether it
 * holds something never stored: a session only knows about its own changes.
 *
 * - **Setting.** On every change of the person, before `y-indexeddb` writes it. The marker goes in a transaction whose scope
 *   includes the updates, created while the change is still being announced (`afterTransaction` comes before `update`, which
 *   is where `y-indexeddb` creates its own). IndexedDB runs transactions with overlapping scopes in the order they were
 *   created, so the marker is committed first: a tab that dies in between leaves a marker without its change, never a change
 *   without its marker. Nothing remembers that it was set, so another tab clearing it is put back by the next change.
 * - **Clearing.** Only when the snapshot the server stored contains everything the copy holds, which is read, merged and
 *   compared in the same transaction that deletes the marker, so a change that arrives meanwhile is not missed. What a tab
 *   itself has pending is not enough: another tab may have written more.
 */
class PersistedCopy implements LocalCopy {
  private closed = false
  /** Only to spare the reading of the copy when nothing could have been marked; it is never a reason not to write. */
  private mayHoldUnstored: boolean

  constructor(
    private readonly persistence: IndexeddbPersistence,
    private readonly ydoc: Y.Doc,
    readonly name: string,
    readonly hadContent: boolean,
    readonly hadUnstoredChanges: boolean,
  ) {
    this.mayHoldUnstored = hadUnstoredChanges
    ydoc.on('afterTransaction', this.onTransaction)
  }

  settle(snapshot: Y.Snapshot): Promise<void> {
    const database = this.persistence.db
    if (!this.mayHoldUnstored || this.closed || database === null) return Promise.resolve()
    return new Promise((resolve) => {
      try {
        const transaction = database.transaction([UPDATES_STORE, CUSTOM_STORE], 'readwrite')
        const rows = transaction.objectStore(UPDATES_STORE).getAll()
        rows.onsuccess = () => {
          const updates: Uint8Array[] = rows.result
          // An unreadable or empty copy holds nothing a snapshot could lack.
          if (updates.length === 0 || Y.snapshotContainsUpdate(snapshot, Y.mergeUpdates(updates))) {
            transaction.objectStore(CUSTOM_STORE).delete(UNSYNCED)
            this.mayHoldUnstored = false
          }
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve()
        transaction.onabort = () => resolve()
      } catch {
        // A connection that is closing: the marker stays, which is the safe side.
        resolve()
      }
    })
  }

  close(): void {
    void this.stop()
  }

  purge(): Promise<void> {
    return deleteCopy(this.name, stopCopiesNamed(this.name))
  }

  /** The document is no longer followed from this call on, before the connection to the database has closed. */
  stop(): Promise<void> {
    this.closed = true
    openCopies.delete(this)
    this.ydoc.off('afterTransaction', this.onTransaction)
    return this.persistence.destroy()
  }

  private readonly onTransaction = (transaction: Y.Transaction): void => {
    // What the cache itself loads and what the server sends are not the person's.
    if (!transaction.local || !changesTheDocument(transaction)) return
    this.mayHoldUnstored = true
    const database = this.persistence.db
    if (this.closed || database === null) return
    try {
      database.transaction([CUSTOM_STORE, UPDATES_STORE], 'readwrite').objectStore(CUSTOM_STORE).put(MARKED, UNSYNCED)
    } catch {
      // A connection that is closing keeps nothing of what follows either.
    }
  }
}

/** Whether a transaction added any struct or deleted anything: the ones that make `y-indexeddb` write an update. */
function changesTheDocument({ beforeState, afterState, deleteSet }: Y.Transaction): boolean {
  if (deleteSet.clients.size > 0) return true
  for (const [client, clock] of afterState) if ((beforeState.get(client) ?? 0) < clock) return true
  return false
}

/**
 * Opens the copy of a document and loads what it holds into `ydoc`, which must be new. It is `null` when this browser
 * keeps nothing for the page (no IndexedDB, or one that does not answer): the document is then opened from the server alone.
 */
export async function openLocalCopy(key: CopyKey, ydoc: Y.Doc): Promise<LocalCopy | null> {
  if (!keepsStorage()) return null
  const name = copyName(key)
  // A copy that is being deleted is not opened again before it is gone: it would be loaded back, and with it what was
  // purged.
  await deletions.get(name)?.catch(() => undefined)

  const persistence = new IndexeddbPersistence(name, ydoc)
  if (!(await loadsWithin(persistence, LOAD_TIMEOUT_MS))) {
    void persistence.destroy()
    return null
  }
  // A marker that cannot be read is taken as set: asking once too often loses nothing, not asking might.
  const hadUnstoredChanges = await persistence.get(UNSYNCED).then(
    (value: unknown) => value !== undefined,
    () => true,
  )
  const copy = new PersistedCopy(persistence, ydoc, name, Y.encodeStateVector(ydoc).byteLength > 1, hadUnstoredChanges)
  openCopies.add(copy)
  return copy
}

/** Some browsers throw on reading `indexedDB` when the site's data is blocked, which is as good as having none. */
function keepsStorage(): boolean {
  try {
    return typeof indexedDB !== 'undefined'
  } catch {
    return false
  }
}

function loadsWithin(persistence: IndexeddbPersistence, milliseconds: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), milliseconds)
    void persistence.whenSynced.then(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

/** Every open copy of this name stops, so that no connection of this page keeps the database from being deleted. */
async function stopCopiesNamed(name: string): Promise<void> {
  await Promise.all([...openCopies].filter((copy) => copy.name === name).map((copy) => copy.stop()))
}

function deleteCopy(name: string, closing: Promise<void>): Promise<void> {
  const deleted: Promise<void> = closing
    .then(() => clearDocument(name))
    .then(() => undefined)
    .finally(() => {
      if (deletions.get(name) === deleted) deletions.delete(name)
    })
  deletions.set(name, deleted)
  return deleted
}

// --- Every copy of an account (sign-out and account switch, protocol section 12.2) ---------------------------------

/**
 * The names of the copies of an account on this device, open or not. A browser that keeps nothing has none. One that keeps
 * copies and cannot list them is an error and not an empty answer: leaving an account must not go on as if there was
 * nothing to remove.
 */
export async function copiesOf(userId: string): Promise<string[]> {
  if (!keepsStorage()) return []
  if (typeof indexedDB.databases !== 'function') throw new Error('This browser cannot list the copies it keeps')
  const prefix = accountPrefix(userId)
  const databases = await indexedDB.databases()
  return databases.flatMap(({ name }) => (name?.startsWith(prefix) ? [name] : []))
}

/** Whether a copy holds changes that were never stored, read without loading its content. */
export function hasUnstoredChanges(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = indexedDB.open(name)
    let missing = false
    request.onupgradeneeded = () => {
      // Deleted since it was listed: opening must not bring it back.
      missing = true
      request.transaction?.abort()
    }
    request.onerror = () => resolve(!missing)
    request.onsuccess = () => {
      const database = request.result
      const finish = (unstored: boolean) => {
        database.close()
        resolve(unstored)
      }
      try {
        const marker = database.transaction(CUSTOM_STORE).objectStore(CUSTOM_STORE).get(UNSYNCED)
        marker.onsuccess = () => finish(marker.result !== undefined)
        marker.onerror = () => finish(true)
      } catch {
        finish(true)
      }
    }
  })
}

/** Deletes the copies with these names, the ones that are open included: they stop following their documents first. */
export async function purgeCopies(names: readonly string[]): Promise<void> {
  await Promise.all(names.map((name) => deleteCopy(name, stopCopiesNamed(name))))
}
