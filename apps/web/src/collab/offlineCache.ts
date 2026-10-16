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
const MARKED = 1

/** Storage that never answers (blocked, or a failed open) must not keep the person from the document. */
export const LOAD_TIMEOUT_MS = 3_000

/** A copy that is open: the document it follows and the marker of what was never stored. */
export interface LocalCopy {
  /** The copy held content when it was opened: there is something to show before any connection. */
  readonly hadContent: boolean
  /** The marker was set when it was opened: changes of this device that the server was not shown to have stored. */
  readonly hadUnstoredChanges: boolean
  /** Written in order with the document's updates, and only when it changes. */
  markUnsynced(): void
  clearUnsynced(): void
  /** Stops following the document; the copy stays on the device. */
  close(): void
  /** Stops following the document and deletes the copy. */
  purge(): Promise<void>
}

const openCopies = new Set<PersistedCopy>()
const deletions = new Map<string, Promise<void>>()

class PersistedCopy implements LocalCopy {
  private marked: boolean
  private closed = false

  constructor(
    private readonly persistence: IndexeddbPersistence,
    readonly name: string,
    readonly hadContent: boolean,
    readonly hadUnstoredChanges: boolean,
  ) {
    this.marked = hadUnstoredChanges
  }

  markUnsynced(): void {
    this.write(true)
  }

  clearUnsynced(): void {
    this.write(false)
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
    return this.persistence.destroy()
  }

  private write(marked: boolean): void {
    if (this.closed || marked === this.marked) return
    this.marked = marked
    const written = marked ? this.persistence.set(UNSYNCED, MARKED) : this.persistence.del(UNSYNCED)
    // A marker that could not be written is written again by the next change that needs it.
    written.catch(() => {
      this.marked = !marked
    })
  }
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
  const copy = new PersistedCopy(persistence, name, Y.encodeStateVector(ydoc).byteLength > 1, hadUnstoredChanges)
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

/** The names of the copies of an account on this device, open or not. */
export async function copiesOf(userId: string): Promise<string[]> {
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
