import { describe, expect, it } from 'vitest'
import { createTokenBucket } from './tokenBucket.ts'

describe('the token bucket', () => {
  const bucketAt = (clock: { now: number }) => createTokenBucket({ perSecond: 100, burst: 200, now: () => clock.now })

  it('lets the burst through and refuses the next message', () => {
    const bucket = bucketAt({ now: 0 })

    const taken = Array.from({ length: 201 }, () => bucket.take())

    expect(taken.slice(0, 200).every(Boolean)).toBe(true)
    expect(taken[200]).toBe(false)
  })

  it('refills at the rate, a token every ten milliseconds', () => {
    const clock = { now: 0 }
    const bucket = bucketAt(clock)
    for (let index = 0; index < 200; index += 1) bucket.take()

    expect(bucket.take()).toBe(false)
    clock.now = 10
    expect(bucket.take()).toBe(true)
    expect(bucket.take()).toBe(false)
    clock.now = 30
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false])
  })

  it('never holds more than the burst, however long the connection was quiet', () => {
    const clock = { now: 0 }
    const bucket = bucketAt(clock)
    clock.now = 3_600_000

    const taken = Array.from({ length: 201 }, () => bucket.take())

    expect(taken.filter(Boolean)).toHaveLength(200)
  })

  it.each([
    ['a token a second', 1, 0, 1],
    ['two seconds for a token at half a token a second', 0.5, 0, 2],
    ['a second when the next token is only a few milliseconds away', 100, 0, 1],
  ])('says how long to wait for the next token: %s', (_name, perSecond, now, seconds) => {
    const bucket = createTokenBucket({ perSecond, burst: 1, now: () => now })
    bucket.take()

    expect(bucket.secondsUntilToken()).toBe(seconds)
  })

  it('is full only while nothing has been taken since it refilled', () => {
    const clock = { now: 0 }
    const bucket = bucketAt(clock)
    expect(bucket.isFull()).toBe(true)

    bucket.take()
    expect(bucket.isFull()).toBe(false)
    clock.now = 10
    expect(bucket.isFull()).toBe(true)
  })
})
