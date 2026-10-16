import { MAX_AWARENESS_STATE_BYTES } from '@draftroom/contract/collab'
import { describe, expect, it } from 'vitest'
import { guardAwareness, type ClientIdOwners, type Speaker } from './awarenessGuard.ts'

const speaker: Speaker = { socketId: 'socket-1', userId: 'user-1', displayName: 'Marta Ruiz' }
const colour = '#3366cc'

/** Runs the guard on a fresh update and gives what it left of it. */
function guard(
  states: readonly (readonly [number, Record<string, unknown>])[],
  options: { removed?: readonly number[]; owners?: ClientIdOwners; as?: Speaker } = {},
) {
  const update = { states: new Map(states), removedClients: new Set(options.removed ?? []) }
  const owners = options.owners ?? new Map<number, string>()
  guardAwareness(update, options.as ?? speaker, owners)
  return { states: update.states, removed: update.removedClients, owners }
}

const own = (extra: Record<string, unknown> = {}) => ({ user: { id: 'user-1', name: 'x', color: colour }, ...extra })

describe('the state a client publishes', () => {
  it('is kept with its cursor, and the name is the one the database has', () => {
    const { states } = guard([[1, own({ cursor: { anchor: 1, head: 2 } })]])

    expect(states.get(1)).toEqual({
      user: { id: 'user-1', name: 'Marta Ruiz', color: colour },
      cursor: { anchor: 1, head: 2 },
    })
  })

  it('loses every key but user and cursor, and every key of user but id, name and colour', () => {
    const { states } = guard([[1, { user: { id: 'user-1', name: 'x', color: colour, admin: true }, secret: 1 }]])

    expect(states.get(1)).toEqual({ user: { id: 'user-1', name: 'Marta Ruiz', color: colour } })
  })

  // Rows: why a state is dropped altogether.
  const dropped: readonly (readonly [string, Record<string, unknown>])[] = [
    ['it names another person', { user: { id: 'user-2', name: 'x', color: colour } }],
    ['it names nobody', {}],
    [
      'its colour is not a plain hexadecimal one',
      { user: { id: 'user-1', name: 'x', color: 'red; background: url(//evil)' } },
    ],
    ['its colour is a short hexadecimal one', { user: { id: 'user-1', name: 'x', color: '#fff' } }],
    ['it is larger than the limit', own({ cursor: 'x'.repeat(MAX_AWARENESS_STATE_BYTES) })],
  ]

  it.each(dropped)('is dropped when %s', (_reason, state) => {
    expect(guard([[1, state]]).states.has(1)).toBe(false)
  })

  it('is dropped when another connection published that client id first, and the other connection keeps it', () => {
    const owners: ClientIdOwners = new Map([[1, 'socket-2']])

    const { states, owners: after } = guard([[1, own()]], { owners })

    expect(states.has(1)).toBe(false)
    expect(after.get(1)).toBe('socket-2')
  })

  it('makes its connection the owner of a client id it publishes first', () => {
    expect(guard([[7, own()]]).owners.get(7)).toBe('socket-1')
  })
})

describe('a removal of presence', () => {
  it('is kept for a client id the connection owns', () => {
    expect(guard([], { removed: [1], owners: new Map([[1, 'socket-1']]) }).removed).toEqual(new Set([1]))
  })

  it('is ignored for a client id another connection owns, and for one nobody owns', () => {
    const { removed } = guard([], { removed: [1, 2], owners: new Map([[1, 'socket-2']]) })

    expect(removed.size).toBe(0)
  })
})
