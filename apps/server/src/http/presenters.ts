import type { Schema } from '@draftroom/contract'
import { roleOf, type DocumentRecord } from '../db/documents/caller-documents.ts'
import type { FolderRow } from '../db/folders.ts'
import type { WorkspaceOfMember } from '../db/workspaces.ts'
import type { DocumentRole } from '../db/tables.ts'

// Rows to the shapes of the contract. Instants leave as RFC 3339 UTC.

export const presentWorkspace = (workspace: WorkspaceOfMember): Schema<'Workspace'> => ({
  id: workspace.id,
  name: workspace.name,
  role: workspace.role,
  createdAt: workspace.createdAt.toISOString(),
})

export const presentFolder = (folder: FolderRow): Schema<'Folder'> => ({
  id: folder.id,
  workspaceId: folder.workspace_id,
  name: folder.name,
  revision: folder.revision,
  createdAt: folder.created_at.toISOString(),
  updatedAt: folder.updated_at.toISOString(),
})

/**
 * A document as the person with `role` sees it. How a document is shared is the owners' to know, so everyone else gets
 * `null` for `generalAccess`; this is the one place that decides it, and it covers the `current` of a 409 as well.
 */
export function presentDocument(record: DocumentRecord, role: DocumentRole): Schema<'Document'> {
  // Every person who creates a document has signed up, and a person who signed up has a name.
  if (record.creator.name === null) throw new Error(`The creator of document ${record.id} has no name`)
  return {
    id: record.id,
    workspaceId: record.workspace_id,
    folderId: record.folder_id,
    title: record.title,
    excerpt: record.excerpt,
    revision: record.revision,
    role,
    generalAccess: role === 'owner' ? record.general_access : null,
    pinned: record.pinned,
    createdBy: { id: record.creator.id, name: record.creator.name },
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
    archivedAt: record.archived_at?.toISOString() ?? null,
  }
}

/** A document of a list, which only holds documents the person can read: a record with no role there is a bug. */
export function presentReadable(record: DocumentRecord): Schema<'Document'> {
  const role = roleOf(record)
  if (role === null) throw new Error(`The list holds document ${record.id}, which its reader has no role on`)
  return presentDocument(record, role)
}
