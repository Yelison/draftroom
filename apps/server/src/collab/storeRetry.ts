import type { Document, Hocuspocus } from '@hocuspocus/server'
import type { ConnectionContext } from './context.ts'

// Hocuspocus does not retry a failed write: it logs, keeps the document in memory and waits for the next change, so a
// person who stopped typing would never see it stored (F4). This retries by itself (protocol §7.2, step 3).

/** The wait before each attempt after a failure, then the last one for ever: 1 s, 2 s, 4 s, up to 30 s. */
export const RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]

export interface RetryLog {
  warn(details: object, message: string): void
}

interface Waiting {
  attempts: number
  timer: NodeJS.Timeout | undefined
  readonly instance: Hocuspocus<ConnectionContext>
  readonly document: Document
}

/** Runs the store hooks again for a document, at once: the same call a debounced store makes, without the delay. */
export const storeNow = (instance: Hocuspocus<ConnectionContext>, document: Document): Promise<void> =>
  instance.storeDocumentHooks(
    document,
    {
      instance,
      clientsCount: document.getConnectionsCount(),
      document,
      documentName: document.name,
      lastContext: {},
      lastTransactionOrigin: { source: 'local' },
    },
    true,
  )

export class StoreRetry {
  private readonly waiting = new Map<string, Waiting>()
  private readonly delays: readonly number[]
  private readonly log: RetryLog

  constructor(delays: readonly number[], log: RetryLog) {
    this.delays = delays
    this.log = log
  }

  /** A write failed: try again after the next delay, whatever else happens. */
  failed(instance: Hocuspocus<ConnectionContext>, document: Document): void {
    const entry = this.waiting.get(document.name) ?? { attempts: 0, timer: undefined, instance, document }
    clearTimeout(entry.timer)
    const delay = this.delays[Math.min(entry.attempts, this.delays.length - 1)] ?? 0
    entry.attempts += 1
    entry.timer = setTimeout(() => {
      entry.timer = undefined
      // A failure comes back here through `failed`, which schedules the attempt after.
      void storeNow(entry.instance, entry.document)
    }, delay)
    this.waiting.set(document.name, entry)
    this.log.warn(
      { documentName: document.name, attempts: entry.attempts, retryInMs: delay },
      'a write failed; retrying',
    )
  }

  /** A write succeeded: whatever was waiting to retry it is no longer needed. */
  succeeded(documentName: string): void {
    const entry = this.waiting.get(documentName)
    if (entry === undefined) return
    clearTimeout(entry.timer)
    this.waiting.delete(documentName)
  }

  /** The documents whose last write failed and which are waiting to be tried again. */
  get pending(): readonly string[] {
    return [...this.waiting.keys()]
  }

  /** Stops every wait, for a server that is shutting down: it has tried what it could. */
  cancelAll(): void {
    for (const entry of this.waiting.values()) clearTimeout(entry.timer)
    this.waiting.clear()
  }
}
