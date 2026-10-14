import { describe, expect, it } from 'vitest'
import { attributeProblem, normalizedAttributes } from './attributes.ts'

describe('the attributes of a heading', () => {
  const levels = [
    ['level 2', 2, null],
    ['level 3', 3, null],
    ['level 1, which is the page title', 1, 2],
    ['level 4', 4, 3],
    ['level 7', 7, 3],
    ['level 0', 0, 2],
    ['a negative level', -1, 2],
    ['a level with a fraction', 2.5, 2],
    ['text for a level', 'x onclick=1', 2],
    ['a numeric string, which is still not a number', '2', 2],
    ['no level', undefined, 2],
    ['null', null, 2],
  ] as const

  it.each(levels)('treats %s', (_name, level, fixed) => {
    expect(attributeProblem('heading', { level }) === null).toBe(fixed === null)
    expect(normalizedAttributes('heading', { level })?.level ?? null).toBe(fixed)
  })

  it('keeps the other attributes when it puts the level right', () => {
    expect(normalizedAttributes('heading', { level: 1, other: 'kept' })).toEqual({ level: 2, other: 'kept' })
  })
})

describe('the attributes of a numbered list', () => {
  const lists = [
    ['the default', { start: 1, type: null }, null],
    ['a start of 0', { start: 0, type: null }, null],
    ['the largest start', { start: 999_999, type: null }, null],
    ['a numbering style', { start: 1, type: 'a' }, null],
    ['a negative start', { start: -5, type: null }, { start: 1, type: null }],
    ['a start past the limit', { start: 1_000_000, type: null }, { start: 1, type: null }],
    ['a start of 1e20', { start: 1e20, type: null }, { start: 1, type: null }],
    ['a start with a fraction', { start: 1.5, type: null }, { start: 1, type: null }],
    ['no number for a start', { start: null, type: null }, { start: 1, type: null }],
    ['NaN for a start', { start: Number.NaN, type: null }, { start: 1, type: null }],
    ['a numbering style that does not exist', { start: 3, type: 'x onclick=1' }, { start: 3, type: null }],
  ] as const

  it.each(lists)('treats %s', (_name, attrs, fixed) => {
    expect(normalizedAttributes('orderedList', attrs)).toEqual(fixed)
  })
})

describe('nodes with no rules', () => {
  it.each(['paragraph', 'bulletList', 'listItem'])('has nothing to put right in a %s', (type) => {
    expect(attributeProblem(type, { anything: 1 })).toBeNull()
    expect(normalizedAttributes(type, { anything: 1 })).toBeNull()
  })
})
