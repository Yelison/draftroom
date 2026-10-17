import { createTokenBucket, type TokenBucket } from './tokenBucket.ts'

export interface BucketRule {
  /** The sustained rate: how many requests a second one key may make for ever. */
  readonly perSecond: number
  /** What one key may spend at once after being quiet: a page that loads with a dozen requests, a burst of retries. */
  readonly burst: number
}

export interface KeyedBuckets {
  /** `null` when the key may go on, or the seconds it must wait. */
  take(key: string): number | null
}

export interface KeyedBucketsOptions extends BucketRule {
  readonly now: () => number
  /** How many keys are remembered at most, so that a flood of different keys cannot grow the process without bound. */
  readonly maxKeys: number
}

/** How often the buckets that have refilled are looked for once the store is full: a scan is linear in the keys. */
const pruneEveryMs = 1_000

/**
 * One token bucket per key (a session, a network address). A bucket that has refilled is the same as no bucket, so those
 * are forgotten when the store is full, and nobody loses a count by it. If the store is still full of buckets that are in
 * use, the one that went longest without a request is forgotten: a key flood can only make a stranger's count start over,
 * and it needs as many sessions or addresses as there are keys to do it.
 */
export function createKeyedBuckets({ now, maxKeys, ...rule }: KeyedBucketsOptions): KeyedBuckets {
  // A Map iterates in insertion order, and a key is put back at the end each time it is used: the first is the oldest.
  const buckets = new Map<string, TokenBucket>()
  let lastPrune = now()

  const makeRoom = () => {
    if (buckets.size < maxKeys) return
    if (now() - lastPrune >= pruneEveryMs) {
      lastPrune = now()
      for (const [key, bucket] of buckets) if (bucket.isFull()) buckets.delete(key)
    }
    const oldest = buckets.keys().next()
    if (buckets.size >= maxKeys && !oldest.done) buckets.delete(oldest.value)
  }

  return {
    take(key) {
      let bucket = buckets.get(key)
      if (bucket === undefined) {
        makeRoom()
        bucket = createTokenBucket({ ...rule, now })
      } else buckets.delete(key)
      buckets.set(key, bucket)
      return bucket.take() ? null : bucket.secondsUntilToken()
    },
  }
}
