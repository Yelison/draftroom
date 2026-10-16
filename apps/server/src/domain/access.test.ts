import type { DocumentRole } from '@draftroom/contract'
import { describe, expect, it } from 'vitest'
import {
  closureFor,
  grantActivity,
  leavesNoOwner,
  transferRecipient,
  type Closure,
  type ConnectionAccess,
  type OwnerCandidate,
} from './access.ts'

describe('the event of a grant to a role the person did not have', () => {
  // It depends only on the grant they held: none is a first grant, any other is a change of role.
  const rows: readonly (readonly [DocumentRole | null, string])[] = [
    [null, 'access.granted'],
    ['viewer', 'access.changed'],
    ['commenter', 'access.changed'],
    ['editor', 'access.changed'],
    ['owner', 'access.changed'],
  ]

  it.each(rows)('after the grant %s records %s', (previous, expected) => {
    expect(grantActivity(previous)).toBe(expected)
  })
})

const owner = (userId: string, overrides: Partial<OwnerCandidate> = {}): OwnerCandidate => ({
  userId,
  signedUp: true,
  since: new Date('2026-10-01T10:00:00Z'),
  ...overrides,
})

describe('the owner that is always kept', () => {
  const rows: readonly (readonly [string, OwnerCandidate[], string, boolean])[] = [
    ['the only owner', [owner('a')], 'a', true],
    ['one of two owners', [owner('a'), owner('b')], 'a', false],
    ['the only owner who can act, next to a pending one', [owner('a'), owner('p', { signedUp: false })], 'a', true],
    ['a pending owner, next to the only one who can act', [owner('a'), owner('p', { signedUp: false })], 'p', false],
    ['the only owner, who is pending', [owner('p', { signedUp: false })], 'p', false],
    ['someone who is not an owner', [owner('a')], 'z', false],
    ['someone who is not an owner, where nobody is', [], 'z', false],
  ]

  it.each(rows)('removing %s: leaves nobody is %s', (_who, owners, targetId, expected) => {
    expect(leavesNoOwner(owners, targetId)).toBe(expected)
  })
})

describe('who receives what a removed member alone owned', () => {
  const early = new Date('2026-09-01T10:00:00Z')
  const late = new Date('2026-10-01T10:00:00Z')

  it('is the owner who makes the request', () => {
    expect(transferRecipient({ actorId: 'actor', removedId: 'removed' }, [owner('actor'), owner('removed')])).toBe(
      'actor',
    )
  })

  const selfRemoval: readonly (readonly [string, OwnerCandidate[], string | undefined])[] = [
    [
      'the one who has been an owner the longest',
      [owner('self'), owner('late', { since: late }), owner('early', { since: early })],
      'early',
    ],
    ['the lower id when they became owners together', [owner('self'), owner('b'), owner('a')], 'a'],
    [
      'an owner who can act, not a pending one that is older',
      [owner('self'), owner('p', { signedUp: false, since: early }), owner('late', { since: late })],
      'late',
    ],
    ['nobody, when nobody remains', [owner('self')], undefined],
  ]

  it.each(selfRemoval)('when they remove themselves is %s', (_who, owners, expected) => {
    expect(transferRecipient({ actorId: 'self', removedId: 'self' }, owners)).toBe(expected)
  })
})

describe('what a change of access does to an open connection', () => {
  const modes: readonly ConnectionAccess[] = ['read-write', 'readonly', 'refused']
  // Rows: the mode the connection was made with. Columns: the mode the person has now.
  const grid: readonly (readonly [ConnectionAccess, readonly (Closure | null)[]])[] = [
    ['read-write', [null, 'role-changed', 'access-revoked']],
    ['readonly', ['role-changed', null, 'access-revoked']],
  ]

  it.each(
    grid.flatMap(([connected, closures]) => modes.map((now, column) => [connected, now, closures[column]] as const)),
  )('made %s and now %s is %s', (connected, now, expected) => {
    expect(closureFor(connected, now)).toBe(expected ?? null)
  })
})
