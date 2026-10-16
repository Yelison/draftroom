import type { StateStore } from '../../../src/collab/stateStore.ts'
import { Waiter } from './waiter.ts'

/**
 * A store that can be told to fail or to hang, over the real one, for the tests of what the server does when the database
 * does not answer. Every attempt is counted, and a test waits for the count instead of for a time.
 */
export class FlakyStore implements StateStore {
  /** Writes fail with an error while this is set. */
  failing = false
  /** Writes never finish while this is set, as a database that stopped answering. */
  hanging = false
  failed = 0
  hung = 0
  succeeded = 0
  private readonly inner: StateStore
  private readonly waiter = new Waiter()

  constructor(inner: StateStore) {
    this.inner = inner
  }

  load(documentId: string): Promise<Uint8Array | undefined> {
    return this.inner.load(documentId)
  }

  async save(documentId: string, state: Uint8Array): Promise<void> {
    if (this.hanging) {
      this.hung += 1
      this.waiter.changed()
      return new Promise<void>(() => undefined)
    }
    if (this.failing) {
      this.failed += 1
      this.waiter.changed()
      throw new Error('The disk is full')
    }
    await this.inner.save(documentId, state)
    this.succeeded += 1
    this.waiter.changed()
  }

  waitForFailures(count: number): Promise<void> {
    return this.waiter
      .until(() => (this.failed >= count ? true : undefined), `${count} failed writes`)
      .then(() => undefined)
  }

  waitForHang(): Promise<void> {
    return this.waiter.until(() => (this.hung >= 1 ? true : undefined), 'a write that hangs').then(() => undefined)
  }

  waitForSuccesses(count: number): Promise<void> {
    return this.waiter
      .until(() => (this.succeeded >= count ? true : undefined), `${count} writes`)
      .then(() => undefined)
  }
}
