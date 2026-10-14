import type { Schema } from '@draftroom/contract'
import { buildTree, type TreeItem } from './treeModel.ts'

const timestamp = '2026-10-13T09:00:00.000Z'

export const folder = (id: string, name: string): Schema<'Folder'> => ({
  id,
  workspaceId: 'workspace',
  name,
  revision: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const document = (id: string, title: string, folderId: string | null = null): Schema<'Document'> => ({
  id,
  workspaceId: 'workspace',
  folderId,
  title,
  excerpt: null,
  revision: 1,
  role: 'owner',
  generalAccess: 'none',
  pinned: false,
  createdBy: { id: 'person', name: 'Marta Ruiz' },
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
})

/** A small tree to walk: Recent (two of the documents), a folder with two documents and one loose document. */
export function sampleTree(): TreeItem[] {
  return buildTree({
    folders: [folder('f1', 'Product')],
    documents: [
      document('d1', 'Launch plan', 'f1'),
      document('d2', 'Weekly update'),
      document('d3', 'Brand voice', 'f1'),
    ],
    searching: false,
    recentLabel: 'Recent',
  })
}
