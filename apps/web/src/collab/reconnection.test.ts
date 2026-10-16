import { CLOSE_CODES, LIBRARY_CLOSE_CODES, RECONNECT_STABLE_MS } from '@draftroom/contract/collab'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReconnectBackoff, reconnectsOnItsOwn } from './reconnection.ts'

describe('which closes the client answers by itself', () => {
  it.each([
    { name: 'rate-limited', code: CLOSE_CODES['rate-limited'], inBand: false, own: true },
    { name: 'role-changed', code: CLOSE_CODES['role-changed'], inBand: false, own: true },
    { name: 'connection-reset', code: LIBRARY_CLOSE_CODES['connection-reset'], inBand: false, own: true },
    { name: 'connection-timeout', code: LIBRARY_CLOSE_CODES['connection-timeout'], inBand: false, own: true },
    { name: 'an in-band close', code: 1000, inBand: true, own: true },
    { name: 'a socket that closed with 1000', code: 1000, inBand: false, own: false },
    { name: 'going away (the server shuts down)', code: 1001, inBand: false, own: false },
    { name: 'an abnormal close', code: 1006, inBand: false, own: false },
    { name: 'a close with no code', code: null, inBand: false, own: false },
  ])('$name: $own', ({ code, inBand, own }) => {
    expect(reconnectsOnItsOwn({ code, inBand })).toBe(own)
  })
})

describe('the reconnect back-off', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Without chance, so a delay is exactly the ceiling of its attempt. */
  const whole = () => createReconnectBackoff({ now: () => Date.now(), random: () => 1 })
  const rateLimited = { code: CLOSE_CODES['rate-limited'] }

  it('waits 1, 2, 4, 8, 16 and then 30 s, and stays at 30', () => {
    const backoff = whole()

    const delays = Array.from({ length: 8 }, () => backoff.delayAfter(rateLimited))

    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000])
  })

  it('draws the delay between half of the ceiling and the whole of it', () => {
    const lowest = createReconnectBackoff({ now: () => Date.now(), random: () => 0 })

    expect([lowest.delayAfter(rateLimited), lowest.delayAfter(rateLimited), lowest.delayAfter(rateLimited)]).toEqual([
      500, 1_000, 2_000,
    ])
  })

  it('keeps growing after a connection that was established but did not last', () => {
    const backoff = whole()
    backoff.delayAfter(rateLimited)
    backoff.connected()
    vi.advanceTimersByTime(RECONNECT_STABLE_MS - 1)

    expect(backoff.delayAfter(rateLimited)).toBe(2_000)
  })

  it('starts over at 1 s after a connection that stayed up for 60 s', () => {
    const backoff = whole()
    for (let attempt = 0; attempt < 5; attempt += 1) backoff.delayAfter(rateLimited)
    backoff.connected()
    vi.advanceTimersByTime(RECONNECT_STABLE_MS)

    expect(backoff.delayAfter(rateLimited)).toBe(1_000)
    expect(backoff.delayAfter(rateLimited)).toBe(2_000)
  })

  it('comes back at once after a role change on a connection that was stable', () => {
    const backoff = whole()
    backoff.connected()
    vi.advanceTimersByTime(RECONNECT_STABLE_MS)

    expect(backoff.delayAfter({ code: CLOSE_CODES['role-changed'] })).toBe(0)
  })

  it('does not come back at once after a role change on a connection that was not stable', () => {
    const backoff = whole()
    backoff.connected()
    vi.advanceTimersByTime(RECONNECT_STABLE_MS - 1)

    expect(backoff.delayAfter({ code: CLOSE_CODES['role-changed'] })).toBe(1_000)
  })

  it('counts a stable connection once: the next close without a new connection is not stable', () => {
    const backoff = whole()
    backoff.connected()
    vi.advanceTimersByTime(RECONNECT_STABLE_MS)
    backoff.delayAfter(rateLimited)

    expect(backoff.delayAfter({ code: CLOSE_CODES['role-changed'] })).toBe(2_000)
  })
})
