import { describe, expect, it } from 'vitest'
import { createKeyedBuckets } from './keyedBuckets.ts'

describe('a bucket for each key', () => {
  const buckets = (clock: { now: number }, maxKeys = 100) =>
    createKeyedBuckets({ perSecond: 1, burst: 3, now: () => clock.now, maxKeys })

  it('counts each key on its own', () => {
    const limited = buckets({ now: 0 })

    expect([limited.take('a'), limited.take('a'), limited.take('a'), limited.take('a')]).toEqual([null, null, null, 1])
    expect(limited.take('b')).toBeNull()
  })

  it('says how many seconds a key has to wait, and lets it go on when they have passed', () => {
    const clock = { now: 0 }
    const limited = buckets(clock)
    for (let index = 0; index < 3; index += 1) limited.take('a')

    expect(limited.take('a')).toBe(1)
    clock.now = 1_000
    expect(limited.take('a')).toBeNull()
  })

  it('forgets the key that went longest without a request when a flood of different keys fills the store', () => {
    const limited = buckets({ now: 0 }, 2)
    for (let index = 0; index < 3; index += 1) limited.take('victim')

    limited.take('stranger-1')
    limited.take('stranger-2')

    // The victim's count started over: the price of a store that cannot grow, paid only by a flood as wide as the store.
    expect(limited.take('victim')).toBeNull()
  })

  it('forgets the buckets that have refilled before it forgets one that is in use', () => {
    const clock = { now: 0 }
    const limited = buckets(clock, 2)
    for (let index = 0; index < 3; index += 1) limited.take('in-use')
    limited.take('idle')
    clock.now = 2_000

    limited.take('new')

    // `in-use` has two tokens back and no more: a bucket made new would have three.
    expect([limited.take('in-use'), limited.take('in-use'), limited.take('in-use')]).toEqual([null, null, 1])
  })
})
