import { STORE_DEBOUNCE_MS, STORE_MAX_DEBOUNCE_MS } from '@draftroom/contract/collab'
import { RETRY_DELAYS_MS } from './storeRetry.ts'

/** The waits of the collaboration server, which a test shortens so it waits for events and not for the clock. */
export interface CollabTiming {
  /** How long after a change a document is written, and at most how long a stream of changes can postpone it. */
  readonly debounceMs: number
  readonly maxDebounceMs: number
  /** The wait before each retry of a failed write. */
  readonly retryDelaysMs: readonly number[]
  /** How long a shutdown waits for documents whose write has not succeeded (protocol §7.2). */
  readonly shutdownWaitMs: number
  /** How long it then waits for the connections to close and the documents to unload, which a write that hangs would prevent. */
  readonly shutdownGraceMs: number
}

export const productionTiming: CollabTiming = {
  debounceMs: STORE_DEBOUNCE_MS,
  maxDebounceMs: STORE_MAX_DEBOUNCE_MS,
  retryDelaysMs: RETRY_DELAYS_MS,
  shutdownWaitMs: 30_000,
  shutdownGraceMs: 5_000,
}
