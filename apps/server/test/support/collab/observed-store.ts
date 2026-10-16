import type { StateStore } from '../../../src/collab/stateStore.ts'
import { Waiter } from './waiter.ts'

/**
 * The real store, watched: it keeps every state that was written, and it can be told to fail or to hang, for the tests of
 * what the server does when the database does not answer. Every attempt is counted, and a test waits for the count
 * instead of for a time.
 */
export class ObservedStore implements StateStore {
  /** Writes fail with an error while this is set. */
  failing = false
  /** Every write takes this long before it reaches the database: a database that is slow, so that others type meanwhile. */
  writeDelayMs = 0
  /** Writes never finish while this is set, as a database that stopped answering. */
  hanging = false
  failed = 0
  hung = 0
  succeeded = 0
  /** Every state written, in order: what the database held at each moment, which a test reads for what must never be in it. */
  readonly written: Uint8Array[] = []
  private readonly inner: StateStore
  private readonly waiter = new Waiter()

  constructor(inner: StateStore) {
    this.inner = inner
  }

  /** Loads wait for `releaseLoads()` while this is set: a document that is slow to load, as a busy database makes it. */
  holdingLoads = false
  private loadsHeld = 0
  private releaseHeld: (() => void) | undefined
  private held: Promise<void> = Promise.resolve()

  async load(documentId: string): Promise<Uint8Array | undefined> {
    if (this.holdingLoads) {
      this.loadsHeld += 1
      this.waiter.changed()
      await this.held
    }
    return this.inner.load(documentId)
  }

  holdLoads(): void {
    this.holdingLoads = true
    this.held = new Promise((resolve) => {
      this.releaseHeld = resolve
    })
  }

  releaseLoads(): void {
    this.holdingLoads = false
    this.releaseHeld?.()
  }

  waitForHeldLoad(): Promise<void> {
    return this.waiter
      .until(() => (this.loadsHeld >= 1 ? true : undefined), 'a load that is held')
      .then(() => undefined)
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
    if (this.writeDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.writeDelayMs))
    await this.inner.save(documentId, state)
    this.written.push(state)
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
