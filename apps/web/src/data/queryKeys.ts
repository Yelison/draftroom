import type { QueryKey } from '@tanstack/react-query'
import type { RequestOf } from './DataSource.ts'

/**
 * Every TanStack Query key of the app, in one place. A key starts with what it belongs to (`workspaces/<id>/...`,
 * `documents/<id>/...`), so invalidating a prefix reaches every query under it; the table in `invalidations.ts` says
 * which mutation reaches which.
 */
export const queryKeys = {
  me: () => ['me'] as const,

  workspaces: () => ['workspaces'] as const,
  workspace: (workspaceId: string) => ['workspaces', workspaceId] as const,
  members: (workspaceId: string) => ['workspaces', workspaceId, 'members'] as const,
  folders: (workspaceId: string) => ['workspaces', workspaceId, 'folders'] as const,
  /** Every document list of a workspace, whatever its filters: the prefix to invalidate. */
  documentLists: (workspaceId: string) => ['workspaces', workspaceId, 'documents'] as const,
  documentList: (workspaceId: string, filters: ListFilters = {}) =>
    ['workspaces', workspaceId, 'documents', filters] as const,
  pinned: (workspaceId: string) => ['workspaces', workspaceId, 'pinned'] as const,
  shared: (workspaceId: string, access?: SharedAccess) =>
    access === undefined
      ? (['workspaces', workspaceId, 'shared'] as const)
      : (['workspaces', workspaceId, 'shared', access] as const),
  workspaceActivity: (workspaceId: string) => ['workspaces', workspaceId, 'activity'] as const,

  document: (documentId: string) => ['documents', documentId] as const,
  access: (documentId: string) => ['documents', documentId, 'access'] as const,
  threads: (documentId: string) => ['documents', documentId, 'threads'] as const,
  versions: (documentId: string) => ['documents', documentId, 'versions'] as const,
  documentActivity: (documentId: string) => ['documents', documentId, 'activity'] as const,

  templates: (locale: 'en' | 'es') => ['templates', locale] as const,
} as const satisfies Record<string, (...args: never[]) => QueryKey>

/** The filters of a document list, as the query parameters of `listDocuments` name them. */
export type ListFilters = NonNullable<NonNullable<RequestOf<'listDocuments'>['params']['query']>>
type SharedAccess = NonNullable<NonNullable<RequestOf<'listSharedDocuments'>['params']>['query']>['access']
