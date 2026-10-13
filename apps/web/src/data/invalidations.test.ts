import { describe, expect, it } from 'vitest'
import { eventInvalidations, keysAfterEvent, keysAfterMutation, mutationInvalidations } from './invalidations.ts'
import { queryKeys } from './queryKeys.ts'
import { loadContract } from './testing/contract.ts'

const contract = loadContract()
const scope = { workspaceId: 'ws-1', documentId: 'doc-1' }

describe('the invalidation table', () => {
  it('has a row for every operation of the contract that changes state, and for no other', () => {
    const mutations = contract.operations
      .filter((operation) => operation.method !== 'get')
      .map((operation) => operation.id)

    expect(Object.keys(mutationInvalidations).sort()).toEqual(mutations.sort())
  })

  it('names, for every row, at least one query to refresh', () => {
    for (const names of [...Object.values(mutationInvalidations), ...Object.values(eventInvalidations)]) {
      expect(names.length).toBeGreaterThan(0)
    }
  })

  it('clears the whole cache when the session changes', () => {
    for (const mutation of ['signUp', 'signIn', 'signOut'] as const) {
      expect(keysAfterMutation(mutation, scope)).toEqual([[]])
    }
  })

  it('refreshes what the README says a rename touches, and nothing else', () => {
    expect(keysAfterMutation('updateDocument', scope)).toEqual([
      queryKeys.document('doc-1'),
      queryKeys.documentLists('ws-1'),
      queryKeys.pinned('ws-1'),
      queryKeys.shared('ws-1'),
      queryKeys.workspaceActivity('ws-1'),
      queryKeys.documentActivity('doc-1'),
    ])
  })

  it('refreshes the access list, not the threads, when access changes', () => {
    const keys = keysAfterMutation('setAccess', scope)

    expect(keys).toContainEqual(queryKeys.access('doc-1'))
    expect(keys).not.toContainEqual(queryKeys.threads('doc-1'))
  })

  it('maps the events of other people to the queries they make stale', () => {
    expect(keysAfterEvent('comments-changed', scope)).toEqual([queryKeys.threads('doc-1')])
    expect(keysAfterEvent('access-changed', scope)).toEqual([
      queryKeys.access('doc-1'),
      queryKeys.document('doc-1'),
      queryKeys.shared('ws-1'),
    ])
  })

  it('refuses to guess which document a document-level change is about', () => {
    expect(() => keysAfterMutation('updateDocument', { workspaceId: 'ws-1' })).toThrow('documentId')
  })

  it('reaches every list of a workspace with one prefix, whatever filters it was fetched with', () => {
    const prefix = queryKeys.documentLists('ws-1')
    const listed = queryKeys.documentList('ws-1', { archived: true, query: 'plan' })

    expect(listed.slice(0, prefix.length)).toEqual([...prefix])
  })
})
