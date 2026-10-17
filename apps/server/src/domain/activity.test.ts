import { describe, expect, it } from 'vitest'
import { readContractDocument } from '../http/contract-document.ts'
import { sharingActivity } from './activity.ts'

describe('the events that reveal how a document is shared', () => {
  it('are exactly the ones the contract keeps for the owners of a document', () => {
    const event = readContractDocument().components.schemas['ActivityEvent'] as {
      'x-draftroom-restricted': { types: string[]; visibleTo: string[] }
    }

    expect([...sharingActivity].sort()).toEqual([...event['x-draftroom-restricted'].types].sort())
    expect(event['x-draftroom-restricted'].visibleTo).toEqual(['owner'])
  })
})
