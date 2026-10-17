import { describe, expect, it } from 'vitest'
import { isStorableInstant } from './instants.ts'

describe('the instants the database can hold', () => {
  it.each([
    ['2026-10-13T10:00:00Z', true],
    ['0001-01-01T00:00:00Z', true],
    ['0000-12-31T23:59:59Z', false],
  ])('hold %s: %s', (timestamp, storable) => {
    expect(isStorableInstant(timestamp)).toBe(storable)
  })
})
