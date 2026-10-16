import { Document, Hocuspocus } from '@hocuspocus/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RETRY_DELAYS_MS, StoreRetry } from './storeRetry.ts'

// The wait before each attempt after a failed write, with a clock the test moves: nothing here waits for real time.

describe('retrying a failed write', () => {
  let instance: Hocuspocus
  let attempts: ReturnType<typeof vi.spyOn>
  let retry: StoreRetry
  const warnings: object[] = []
  const document = new Document('doc:00000000-0000-4000-8000-000000000001')

  beforeEach(() => {
    vi.useFakeTimers()
    instance = new Hocuspocus({ quiet: true })
    attempts = vi.spyOn(instance, 'storeDocumentHooks').mockResolvedValue(undefined)
    retry = new StoreRetry(RETRY_DELAYS_MS, { warn: (details) => warnings.push(details) })
    warnings.length = 0
  })
  afterEach(() => {
    retry.cancelAll()
    vi.useRealTimers()
  })

  it('tries again after 1 s, 2 s, 4 s, 8 s, 16 s and then every 30 s, for as long as the writes fail', () => {
    const waited: number[] = []
    for (let failure = 0; failure < 8; failure += 1) {
      retry.failed(instance, document)
      const before = attempts.mock.calls.length
      // Time stops one millisecond short of the wait: nothing yet. Then the last millisecond: the attempt.
      const delay = RETRY_DELAYS_MS[Math.min(failure, RETRY_DELAYS_MS.length - 1)] ?? 0
      vi.advanceTimersByTime(delay - 1)
      expect(attempts.mock.calls.length).toBe(before)
      vi.advanceTimersByTime(1)
      expect(attempts.mock.calls.length).toBe(before + 1)
      waited.push(delay)
    }

    expect(waited).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000])
  })

  it('runs the store hooks at once and for that document, as a debounced store does without the debounce', () => {
    retry.failed(instance, document)
    vi.advanceTimersByTime(1_000)

    expect(attempts).toHaveBeenCalledWith(document, expect.objectContaining({ documentName: document.name }), true)
  })

  it('stops waiting when a write succeeds, and starts again from one second after the next failure', () => {
    retry.failed(instance, document)
    retry.failed(instance, document)
    retry.succeeded(document.name)
    vi.advanceTimersByTime(60_000)
    expect(attempts).not.toHaveBeenCalled()
    expect(retry.pending).toEqual([])

    retry.failed(instance, document)
    vi.advanceTimersByTime(999)
    expect(attempts).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(attempts).toHaveBeenCalledTimes(1)
  })

  it('lists the documents that are waiting, and forgets them all when it is cancelled', () => {
    retry.failed(instance, document)
    expect(retry.pending).toEqual([document.name])

    retry.cancelAll()
    vi.advanceTimersByTime(60_000)

    expect(retry.pending).toEqual([])
    expect(attempts).not.toHaveBeenCalled()
  })

  it('says each failure, with the document and how long it will wait', () => {
    retry.failed(instance, document)

    expect(warnings).toEqual([{ documentName: document.name, attempts: 1, retryInMs: 1_000 }])
  })
})
