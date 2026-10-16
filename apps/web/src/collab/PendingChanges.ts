import * as Y from 'yjs'

// Merging on every keystroke would copy everything pending each time: a long offline stretch would cost the square of
// its edits. The updates are merged in batches instead, and always before they are read.
const MERGE_EVERY = 128

/**
 * What this client changed and the server has not been shown to have stored (`pending` in protocol section 7.4): one Yjs
 * update, or nothing. It survives reconnections and is dropped only when a `stored` snapshot contains it, or when the
 * changes are discarded.
 */
export class PendingChanges {
  private updates: Uint8Array[] = []

  get isEmpty(): boolean {
    return this.updates.length === 0
  }

  add(update: Uint8Array): void {
    this.updates.push(update)
    if (this.updates.length >= MERGE_EVERY) this.merge()
  }

  /** Whether a snapshot of what the server stored contains every change: each struct and each deletion. */
  isContainedIn(snapshot: Y.Snapshot): boolean {
    return this.isEmpty || Y.snapshotContainsUpdate(snapshot, this.merge())
  }

  clear(): void {
    this.updates = []
  }

  private merge(): Uint8Array {
    const merged = this.updates.length === 1 ? (this.updates[0] ?? new Uint8Array()) : Y.mergeUpdates(this.updates)
    this.updates = [merged]
    return merged
  }
}
