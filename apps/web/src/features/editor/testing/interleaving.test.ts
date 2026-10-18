import { describe, expect, it } from 'vitest'
import { isInterleavingOf } from './interleaving.ts'

describe('isInterleavingOf', () => {
  it.each([
    ['one run after the other', 'abcxyz', true],
    ['one inside the other', 'abxyzc', true],
    ['a letter twice', 'abxxyzc', false],
    ['a letter lost', 'abxyc', false],
    ['the order of a person changed', 'bacxyz', false],
  ])('%s', (_name, merged, expected) => {
    expect(isInterleavingOf(merged, 'abc', 'xyz')).toBe(expected)
  })
})
