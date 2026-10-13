import { QueryClient, type QueryKey } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  eventInvalidations,
  keysAfterEvent,
  keysAfterMutation,
  mutationInvalidations,
  queryKeys,
  sessionChanges,
  type InvalidationName,
  type Scope,
} from './queryKeys.ts'
import { loadContract } from './testing/contract.ts'

const contract = loadContract()
const scope: Required<Scope> = { workspaceId: 'ws-1', documentId: 'doc-1' }
const elsewhere: Required<Scope> = { workspaceId: 'ws-2', documentId: 'doc-2' }

/** The queries a screen holds for each name of the table, for one workspace and one document. */
const queriesOf: Record<Exclude<InvalidationName, 'everything'>, (where: Required<Scope>) => QueryKey[]> = {
  workspace: ({ workspaceId }) => [queryKeys.workspace(workspaceId)],
  workspaces: () => [queryKeys.workspaces()],
  members: ({ workspaceId }) => [queryKeys.members(workspaceId)],
  folders: ({ workspaceId }) => [queryKeys.folders(workspaceId)],
  documentLists: ({ workspaceId }) => [
    queryKeys.documentList(workspaceId),
    queryKeys.documentList(workspaceId, { archived: true, query: 'plan' }),
  ],
  pinned: ({ workspaceId }) => [queryKeys.pinned(workspaceId)],
  shared: ({ workspaceId }) => [queryKeys.shared(workspaceId, 'edit'), queryKeys.shared(workspaceId, 'view')],
  workspaceActivity: ({ workspaceId }) => [queryKeys.workspaceActivity(workspaceId)],
  document: ({ documentId }) => [queryKeys.document(documentId)],
  access: ({ documentId }) => [queryKeys.access(documentId)],
  threads: ({ documentId }) => [queryKeys.threads(documentId)],
  versions: ({ documentId }) => [queryKeys.versions(documentId)],
  documentActivity: ({ documentId }) => [queryKeys.documentActivity(documentId)],
}

const names = Object.keys(queriesOf) as (keyof typeof queriesOf)[]

interface Cached {
  /** The name of the table this query belongs to, and whose it is: the workspace and document it was fetched for. */
  name: keyof typeof queriesOf | 'me' | 'templates'
  where: 'here' | 'elsewhere'
  key: QueryKey
}

/** A client whose cache holds every kind of query for two workspaces and two documents, none of them stale. */
function populatedClient() {
  const client = new QueryClient()
  const cached: Cached[] = [
    { name: 'me', where: 'here', key: queryKeys.me() },
    { name: 'templates', where: 'here', key: queryKeys.templates('en') },
  ]
  for (const [where, at] of [
    ['here', scope],
    ['elsewhere', elsewhere],
  ] as const) {
    for (const name of names) {
      for (const key of queriesOf[name](at)) cached.push({ name, where, key })
    }
  }
  // `workspaces` is the person's own list, shared by every workspace: it exists once.
  const seen = new Set<string>()
  const unique = cached.filter(({ key }) => !seen.has(JSON.stringify(key)) && seen.add(JSON.stringify(key)))
  for (const { key } of unique) client.setQueryData(key, 'data')
  return { client, cached: unique }
}

/** What the cache says is stale after the keys of a trigger were invalidated, as the app would do it. */
async function staleAfter(keys: QueryKey[]) {
  const { client, cached } = populatedClient()
  for (const queryKey of keys) await client.invalidateQueries({ queryKey })
  return cached.filter(({ key }) => client.getQueryState(key)?.isInvalidated === true)
}

describe('the invalidation table', () => {
  it('has a row for every operation of the contract that changes state, and for no other', () => {
    const mutations = contract.operations
      .filter((operation) => operation.method !== 'get')
      .map((operation) => operation.id)

    expect(Object.keys(mutationInvalidations).sort()).toEqual(mutations.sort())
  })

  it('names, for every row, at least one query to refresh', () => {
    for (const rowNames of [...Object.values(mutationInvalidations), ...Object.values(eventInvalidations)]) {
      expect(rowNames.length).toBeGreaterThan(0)
    }
  })

  it('refuses to guess which document a document-level change is about', () => {
    expect(() => keysAfterMutation('updateDocument', { workspaceId: 'ws-1' })).toThrow('documentId')
  })
})

describe('what each row leaves stale in a real cache', () => {
  const rows = [
    ...Object.entries(mutationInvalidations).filter(([id]) => !(sessionChanges as readonly string[]).includes(id)),
    ...Object.entries(eventInvalidations),
  ] as [string, readonly InvalidationName[]][]

  // A row refreshes the queries of the names it lists, for the workspace and document it is about, and nothing else:
  // not the queries of another workspace or document, and not those of a name it does not list.
  it.each(rows)('%s refreshes exactly the queries of its names, and only those of its scope', async (id, rowNames) => {
    const keys =
      id in mutationInvalidations
        ? keysAfterMutation(id as keyof typeof mutationInvalidations, scope)
        : keysAfterEvent(id as keyof typeof eventInvalidations, scope)

    const stale = await staleAfter(keys)

    const expected = new Set(rowNames)
    expect(new Set(stale.map(({ name }) => name))).toEqual(expected)
    expect(stale.filter(({ where, name }) => where === 'elsewhere' && name !== 'workspaces')).toEqual([])
  })

  it('leaves the threads and the versions of a document alone when its access changes', async () => {
    const stale = await staleAfter(keysAfterMutation('setAccess', scope))

    expect(stale.map(({ key }) => key)).toContainEqual(queryKeys.access('doc-1'))
    expect(stale.map(({ key }) => key)).not.toContainEqual(queryKeys.threads('doc-1'))
    expect(stale.map(({ key }) => key)).not.toContainEqual(queryKeys.versions('doc-1'))
  })

  it('renaming a workspace refreshes it and the list of workspaces, not the lists of any workspace', async () => {
    const stale = await staleAfter(keysAfterMutation('updateWorkspace', scope))

    expect(stale.map(({ key }) => key)).toHaveLength(2)
    expect(stale.map(({ key }) => key)).toEqual(
      expect.arrayContaining([queryKeys.workspaces(), queryKeys.workspace('ws-1')]),
    )
  })

  it('reaches every document list of a workspace, whatever its filters, with one key', async () => {
    const stale = await staleAfter(keysAfterMutation('createDocument', scope))

    const lists = stale.filter(({ name }) => name === 'documentLists')
    expect(lists).toHaveLength(2)
    expect(lists.every(({ where }) => where === 'here')).toBe(true)
  })

  it('reaches the shared list with and without its access filter', async () => {
    const stale = await staleAfter(keysAfterMutation('pinDocument', scope))

    expect(stale.filter(({ name }) => name === 'shared')).toHaveLength(2)
  })

  it('refreshes a document through its detail key without touching what hangs from it', async () => {
    const stale = await staleAfter(keysAfterEvent('metadata-changed', scope))

    expect(stale.map(({ name }) => name).sort()).toEqual(['document', 'documentLists', 'documentLists'])
  })
})

describe('the mutations that change the session', () => {
  it('are exactly the rows that clear the whole cache', () => {
    const everything = Object.entries(mutationInvalidations)
      .filter(([, rowNames]) => (rowNames as readonly string[]).includes('everything'))
      .map(([id]) => id)

    expect([...sessionChanges].sort()).toEqual(everything.sort())
  })

  it.each(sessionChanges)('%s leaves every query stale, whoever it was fetched for', async (mutation) => {
    const { client, cached } = populatedClient()

    for (const queryKey of keysAfterMutation(mutation, scope)) await client.invalidateQueries({ queryKey })

    expect(cached.every(({ key }) => client.getQueryState(key)?.isInvalidated === true)).toBe(true)
  })
})
