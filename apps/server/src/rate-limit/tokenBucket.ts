export interface TokenBucket {
  /** Takes one token if there is one. */
  take(): boolean
  /** Whole seconds, at least one, until a token can be taken: what `Retry-After` says. */
  secondsUntilToken(): number
  /** Whether it holds its burst, so forgetting it and starting a new one in its place changes nothing. */
  isFull(): boolean
}

/**
 * A bucket that refills continuously, as the clock says: no timer, so nothing to clean up when its owner goes away.
 * Taking a token is synchronous, so a burst of requests handled by one Node process cannot take more than the bucket holds.
 */
export function createTokenBucket(options: {
  readonly perSecond: number
  readonly burst: number
  readonly now: () => number
}): TokenBucket {
  let tokens = options.burst
  let last = options.now()
  const refill = () => {
    const now = options.now()
    // A wall clock can step back (an NTP correction, a test that sets the time): that must not take tokens away.
    tokens = Math.min(options.burst, tokens + (Math.max(0, now - last) / 1000) * options.perSecond)
    last = now
  }
  return {
    take() {
      refill()
      if (tokens < 1) return false
      tokens -= 1
      return true
    },
    secondsUntilToken() {
      refill()
      return tokens >= 1 ? 1 : Math.max(1, Math.ceil((1 - tokens) / options.perSecond))
    },
    isFull() {
      refill()
      return tokens >= options.burst
    },
  }
}
