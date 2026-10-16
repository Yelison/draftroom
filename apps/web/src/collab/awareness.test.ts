import { describe, expect, it } from 'vitest'
import { isPresenceColor, peersOf } from './awareness.ts'

const state = (id: string, name = `Name of ${id}`, color = '#336699') => ({ user: { id, name, color } })

describe('the people in the document', () => {
  it('leaves out this client, whose own state is in the awareness too', () => {
    const states = new Map<number, unknown>([
      [1, state('me')],
      [2, state('ana')],
    ])

    expect(peersOf(states, 1).map(({ userId }) => userId)).toEqual(['ana'])
  })

  it('lists a person once however many tabs they have open', () => {
    const states = new Map<number, unknown>([
      [2, state('ana', 'Ana')],
      [3, state('ana', 'Ana')],
      [4, state('ben', 'Ben')],
    ])

    expect(peersOf(states, 1)).toEqual([
      { userId: 'ana', name: 'Ana', color: '#336699' },
      { userId: 'ben', name: 'Ben', color: '#336699' },
    ])
  })

  it.each([
    { what: 'a state with no user', value: { cursor: null } },
    { what: 'a user that is not an object', value: { user: 'ana' } },
    { what: 'a user without a name', value: { user: { id: 'ana', color: '#336699' } } },
    { what: 'a user without an id', value: { user: { name: 'Ana', color: '#336699' } } },
    { what: 'a colour that is not a plain hexadecimal one', value: state('ana', 'Ana', 'red; background: url(x)') },
    { what: 'a colour of the short form', value: state('ana', 'Ana', '#369') },
    { what: 'nothing', value: null },
    { what: 'text', value: 'ana' },
  ])('shows nobody for $what', ({ value }) => {
    expect(peersOf(new Map<number, unknown>([[2, value]]), 1)).toEqual([])
  })
})

describe('the colour of a person', () => {
  it.each(['#336699', '#AABBCC', '#0a0B0c'])('accepts %s', (color) => {
    expect(isPresenceColor(color)).toBe(true)
  })

  it.each([
    '#369',
    '#33669',
    '#3366999',
    '336699',
    'red',
    'red; background: url(x)',
    '#33669g',
    '',
    12,
    null,
    undefined,
  ])('refuses %s, which is not safe in a style', (color) => {
    expect(isPresenceColor(color)).toBe(false)
  })
})
