import { describe, expect, it } from 'vitest'
import { readContractDocument } from '../http/contract-document.ts'
import { isStorableInstant, sharingActivity } from './activity.ts'

describe('the events that reveal how a document is shared', () => {
  it('are exactly the ones the contract keeps for the owners of a document', () => {
    const event = readContractDocument().components.schemas['ActivityEvent'] as {
      'x-draftroom-restricted': { types: string[]; visibleTo: string[] }
    }

    expect([...sharingActivity].sort()).toEqual([...event['x-draftroom-restricted'].types].sort())
    expect(event['x-draftroom-restricted'].visibleTo).toEqual(['owner'])
  })
})

describe('the instants a filter may name', () => {
  it.each([
    ['2026-10-13T10:00:00Z', true],
    ['0001-01-01T00:00:00Z', true],
    ['0000-12-31T23:59:59Z', false],
  ])('hold %s: %s', (timestamp, storable) => {
    expect(isStorableInstant(timestamp)).toBe(storable)
  })
})
