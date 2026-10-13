import type { StatelessEvent } from '@draftroom/contract/collab'
import type { QueryKey } from '@tanstack/react-query'
import type { OperationId } from './DataSource.ts'
import { queryKeys } from './queryKeys.ts'

/** Where a change happened: the workspace it belongs to and, for a document-level change, the document. */
export interface Scope {
  workspaceId: string
  documentId?: string
}

// What each name stands for. A name that needs a document fails loudly without one: asking for it is a mistake of the
// caller, and silently skipping the key would leave a screen showing what is no longer true.
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
  // A person's session decides everything they can read: signing in, up or out leaves nothing of the last one behind.
  // The README table has no row for these three; this is the decision recorded here.
  signUp: ['everything'],
  signIn: ['everything'],
  signOut: ['everything'],

  updateWorkspace: ['workspace', 'workspaces'],
  addMember: ['members', 'documentLists', 'pinned', 'shared', 'workspaceActivity'],
  updateMember: ['members', 'documentLists', 'pinned', 'shared', 'workspaceActivity'],
  removeMember: ['members', 'documentLists', 'pinned', 'shared', 'workspaceActivity'],

  createFolder: ['folders', 'documentLists'],
  updateFolder: ['folders', 'documentLists'],
  deleteFolder: ['folders', 'documentLists'],

  createDocument: ['documentLists', 'workspaceActivity'],
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
 * The events other people's changes arrive as, over the collaboration connection (protocol, section 5.3). `stored` is
 * the durability acknowledgement of the sync state machine and `document-too-large` a refusal of the caller's own
 * write: neither says that data other queries show has changed.
 */
type ChangeEvent = Exclude<StatelessEvent['type'], 'stored' | 'document-too-large'>

export const eventInvalidations = {
  'metadata-changed': ['document', 'documentLists'],
  'access-changed': ['access', 'document', 'shared'],
  'comments-changed': ['threads'],
  'versions-changed': ['versions'],
  'document-archived': ['document', 'documentLists'],
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
