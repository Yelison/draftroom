import * as Y from 'yjs'

// What the server knows about the storage of one loaded document, so that "stored" is said only of what was written
// (protocol §7, ADR 0006). The state of the document lives in Hocuspocus; this is the part that tells the clients
// which of it is safe. Nothing here touches the database.

/** The last state known to be in the database: the snapshot clients are told about, and its size. */
export interface StoredSlot {
  /** `Y.encodeSnapshot` of the state, in base64: the payload of the `stored` event. */
  readonly snapshot: string
  /** The byte length of the state, which the size limit of §5.2 reads. */
  readonly size: number
}

/** What one store captured, to be written and then committed. */
export interface CapturedWrite extends StoredSlot {
  readonly state: Uint8Array
  /** How many updates the document had applied when it was captured. */
  readonly changesSeen: number
}

export const snapshotOf = (document: Y.Doc): string =>
  Buffer.from(Y.encodeSnapshot(Y.snapshot(document))).toString('base64')

export class DocumentDurability {
  private slot: StoredSlot
  private changes = 0
  private storedChanges = 0

  /** `loaded` is what the database held when the document was loaded: everything loaded is stored by definition. */
  constructor(loaded: StoredSlot) {
    this.slot = loaded
  }

  /** What a client that connects now is told is stored: never a snapshot of memory that has not been written. */
  get lastStored(): StoredSlot {
    return this.slot
  }

  /**
   * Whether memory holds something the database does not: an update was applied after the last committed capture, or
   * a write failed and has not yet succeeded. While it is true the document must not be unloaded (§7.2).
   */
  get unconfirmed(): boolean {
    return this.changes > this.storedChanges
  }

  noteChange(): void {
    this.changes += 1
  }

  /**
   * The state, its snapshot and its size, from one synchronous run: an update applied between them would be in one and
   * not in the others. Nothing is recorded as stored until {@link commit}.
   */
  capture(document: Y.Doc): CapturedWrite {
    const state = Y.encodeStateAsUpdate(document)
    const snapshot = snapshotOf(document)
    return { state, snapshot, size: state.byteLength, changesSeen: this.changes }
  }

  /**
   * Records a write as committed, from the values captured before it: the slot is assigned only now, because a slot
   * assigned earlier would be handed to the next client after a failed write, which would find its changes covered and
   * show "Synced" for a change that is not stored.
   */
  commit(write: CapturedWrite): void {
    this.slot = { snapshot: write.snapshot, size: write.size }
    this.storedChanges = write.changesSeen
  }
}

/** The durability of every loaded document, by document name. */
export class DurabilityRegistry {
  private readonly documents = new Map<string, DocumentDurability>()
  private stopping = false

  /** Starts tracking a document that was just loaded; its updates from now on are changes to store. */
  track(document: Y.Doc, name: string, loaded: StoredSlot): DocumentDurability {
    const durability = new DocumentDurability(loaded)
    // A synchronous listener on the document, not `onChange`: that hook runs in a later microtask, and a capture taken
    // in between would miss the change it was meant to count.
    document.on('update', () => durability.noteChange())
    this.documents.set(name, durability)
    return durability
  }

  get(name: string): DocumentDurability | undefined {
    return this.documents.get(name)
  }

  forget(name: string): void {
    this.documents.delete(name)
  }

  /** Once the server is shutting down nothing may keep a document in memory: it has done what it can to store them. */
  get shuttingDown(): boolean {
    return this.stopping
  }

  beginShutdown(): void {
    this.stopping = true
  }
}
