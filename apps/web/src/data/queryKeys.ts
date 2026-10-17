import type { StatelessEvent } from '@draftroom/contract/collab'
import type { QueryKey } from '@tanstack/react-query'
import type { OperationId, RequestOf } from './DataSource.ts'

/**
 * Every TanStack Query key of the app, in one place.
 *
 * `invalidateQueries` matches by prefix, so no key may be the prefix of another unless that is meant: a detail key ends
 * in `detail` and a list key in `list`, which leaves nothing under them. The two prefixes that are meant are
 * `documentLists`, which reaches every document list of a workspace whatever its filters, and `shared`, which reaches
 * the shared list with and without its `access` filter. The table below, and the test that runs it against a real
 * `QueryClient`, say which mutation reaches which.
 */
export const queryKeys = {
  me: () => ['me'] as const,

  workspaces: () => ['workspaces', 'list'] as const,
  workspace: (workspaceId: string) => ['workspaces', workspaceId, 'detail'] as const,
  members: (workspaceId: string) => ['workspaces', workspaceId, 'members'] as const,
  folders: (workspaceId: string) => ['workspaces', workspaceId, 'folders'] as const,
  /** Every document list of a workspace, whatever its filters: a prefix on purpose. */
  documentLists: (workspaceId: string) => ['workspaces', workspaceId, 'documents'] as const,
  documentList: (workspaceId: string, filters: ListFilters = {}) =>
    ['workspaces', workspaceId, 'documents', filters] as const,
  pinned: (workspaceId: string) => ['workspaces', workspaceId, 'pinned'] as const,
  /** Without `access`, every shared list of the workspace: a prefix on purpose. */
  shared: (workspaceId: string, access?: SharedAccess) =>
    access === undefined
      ? (['workspaces', workspaceId, 'shared'] as const)
      : (['workspaces', workspaceId, 'shared', access] as const),
  workspaceActivity: (workspaceId: string) => ['workspaces', workspaceId, 'activity'] as const,

  document: (documentId: string) => ['documents', documentId, 'detail'] as const,
  access: (documentId: string) => ['documents', documentId, 'access'] as const,
  threads: (documentId: string) => ['documents', documentId, 'threads'] as const,
  versions: (documentId: string) => ['documents', documentId, 'versions'] as const,
  documentActivity: (documentId: string) => ['documents', documentId, 'activity'] as const,

  templates: (locale: 'en' | 'es') => ['templates', locale] as const,
} as const satisfies Record<string, (...args: never[]) => QueryKey>

/** The filters of a document list, as the query parameters of `listDocuments` name them. */
export type ListFilters = NonNullable<NonNullable<RequestOf<'listDocuments'>['params']['query']>>
type SharedAccess = NonNullable<NonNullable<RequestOf<'listSharedDocuments'>['params']>['query']>['access']

// Which queries a change leaves stale: the table of `docs/api/README.md` ("Cache and invalidation"), as data.

/** Where a change happened: the workspace it belongs to and, for a document-level change, the document. */
export interface Scope {
  workspaceId: string
  documentId?: string
}

// The queries a change makes stale, by name. A name that is about a document fails loudly without one: asking for it
// is a mistake of the caller, and silently skipping the key would leave a screen showing what is no longer true.
const keyOf = {
  everything: () => [],
  workspace: ({ workspaceId }) => queryKeys.workspace(workspaceId),
  workspaces: () => queryKeys.workspaces(),
  members: ({ workspaceId }) => queryKeys.members(workspaceId),
  folders: ({ workspaceId }) => queryKeys.folders(workspaceId),
  documentLists: ({ workspaceId }) => queryKeys.documentLists(workspaceId),
  pinned: ({ workspaceId }) => queryKeys.pinned(workspaceId),
  shared: ({ workspaceId }) => queryKeys.shared(workspaceId),
  workspaceActivity: ({ workspaceId }) => queryKeys.workspaceActivity(workspaceId),
  document: (scope) => queryKeys.document(documentOf(scope)),
  access: (scope) => queryKeys.access(documentOf(scope)),
  threads: (scope) => queryKeys.threads(documentOf(scope)),
  versions: (scope) => queryKeys.versions(documentOf(scope)),
  documentActivity: (scope) => queryKeys.documentActivity(documentOf(scope)),
} satisfies Record<string, (scope: Scope) => QueryKey>

export type InvalidationName = keyof typeof keyOf

function documentOf({ documentId }: Scope): string {
  if (documentId === undefined) throw new Error('This invalidation is about a document, and no documentId was given')
  return documentId
}

/**
 * The mutations of the contract and the queries each one makes stale: the table of `docs/api/README.md` ("Cache and
 * invalidation"), as data. A test requires a row for every operation that changes state.
 */
export const mutationInvalidations = {
  // A person's session decides everything they can read: `everything` is the empty key, which matches every query. The
  // README table has no row for these three; this is the decision recorded here. See `sessionChanges` for why marking
  // the queries stale is not all they need.
  signUp: ['everything'],
  signIn: ['everything'],
  signOut: ['everything'],

  // The person's own query takes the answer as it is (`setQueryData`); what shows their name to others is what goes stale.
  updateMe: ['members', 'documentLists', 'pinned', 'shared', 'workspaceActivity'],
  updateWorkspace: ['workspace', 'workspaces'],
  addMember: ['members', 'documentLists', 'pinned', 'shared', 'workspaceActivity'],
  updateMember: ['members', 'documentLists', 'pinned', 'shared', 'workspaceActivity'],
  removeMember: ['members', 'documentLists', 'pinned', 'shared', 'workspaceActivity'],

  createFolder: ['folders', 'documentLists'],
  updateFolder: ['folders', 'documentLists'],
  deleteFolder: ['folders', 'documentLists'],

  createDocument: ['documentLists', 'workspaceActivity'],
  duplicateDocument: ['documentLists', 'workspaceActivity'],
  updateDocument: ['document', 'documentLists', 'pinned', 'shared', 'workspaceActivity', 'documentActivity'],
  archiveDocument: ['document', 'documentLists', 'pinned', 'shared', 'workspaceActivity'],
  restoreDocument: ['document', 'documentLists', 'pinned', 'shared', 'workspaceActivity'],
  deleteDocument: ['document', 'documentLists', 'pinned', 'shared', 'workspaceActivity'],
  pinDocument: ['document', 'pinned', 'documentLists', 'shared'],
  unpinDocument: ['document', 'pinned', 'documentLists', 'shared'],

  setAccess: ['access', 'document', 'shared', 'workspaceActivity', 'documentActivity'],
  removeAccess: ['access', 'document', 'shared', 'workspaceActivity', 'documentActivity'],
  setGeneralAccess: ['access', 'document', 'shared', 'workspaceActivity', 'documentActivity'],

  createThread: ['threads', 'workspaceActivity', 'documentActivity'],
  replyToThread: ['threads', 'workspaceActivity', 'documentActivity'],
  resolveThread: ['threads', 'workspaceActivity', 'documentActivity'],
  reopenThread: ['threads', 'workspaceActivity', 'documentActivity'],
  updateComment: ['threads', 'workspaceActivity', 'documentActivity'],
  deleteComment: ['threads', 'workspaceActivity', 'documentActivity'],

  // A restore also changes the live content, which reaches the client over the collaboration connection.
  createVersion: ['versions', 'workspaceActivity', 'documentActivity'],
  restoreVersion: ['versions', 'workspaceActivity', 'documentActivity'],
} as const satisfies Partial<Record<OperationId, readonly InvalidationName[]>>

export type MutationId = keyof typeof mutationInvalidations

/**
 * The mutations after which the signed-in person is someone else, or nobody. Invalidating is not enough for them:
 * stale queries keep showing the last person's data until they are refetched, so the cache has to be cleared
 * (`queryClient.clear()`). Doing that belongs to the authentication task (T7.1), which must read this list rather than
 * the names of the three operations.
 */
export const sessionChanges = ['signUp', 'signIn', 'signOut'] as const satisfies readonly MutationId[]

/**
 * The events other people's changes arrive as, over the collaboration connection (protocol, section 5.3). `stored` is
 * the durability acknowledgement of the sync state machine and `document-too-large` a refusal of the caller's own
 * write: neither says that data other queries show has changed.
 */
type ChangeEvent = Exclude<StatelessEvent['type'], 'stored' | 'document-too-large'>

export const eventInvalidations = {
  'metadata-changed': ['document'],
  // The document too: it carries the caller's role, which is what decides what the editor offers once the mode flips.
  'access-changed': ['access', 'document', 'shared'],
  // The protocol also says "and that thread", and there is no query of one thread: the list is what shows it.
  'comments-changed': ['threads'],
  'versions-changed': ['versions'],
  // The archived state the protocol says to show is read from the document.
  'document-archived': ['document'],
} as const satisfies Record<ChangeEvent, readonly InvalidationName[]>

const resolve = (names: readonly InvalidationName[], scope: Scope): QueryKey[] =>
  names.map((name) => keyOf[name](scope))

/** The query keys a mutation leaves stale once it has succeeded. */
export function keysAfterMutation(mutation: MutationId, scope: Scope): QueryKey[] {
  return resolve(mutationInvalidations[mutation], scope)
}

/** The query keys another person's change leaves stale, as the collaboration connection announced it. */
export function keysAfterEvent(event: ChangeEvent, scope: Scope): QueryKey[] {
  return resolve(eventInvalidations[event], scope)
}
