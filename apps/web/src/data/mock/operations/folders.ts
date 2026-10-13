import type { DataSource } from '../../DataSource.ts'
import type { FolderRecord } from '../fixtures/workspaces.ts'
import { caller, requireWorkspaceOwner, workspaceOf, type Context } from '../guards.ts'
import { textLimits } from '../limits.ts'
import { sortRows } from '../pagination.ts'
import { conflict, folderChanged, notFound } from '../problems.ts'
import { checkTexts } from '../text.ts'
import { folderView } from '../views.ts'

type FolderOperations = Pick<DataSource, 'listFolders' | 'createFolder' | 'updateFolder' | 'deleteFolder'>

export function folderOperations(ctx: Context): FolderOperations {
  const { world } = ctx

  /** A folder of a workspace the caller belongs to; any other is as good as missing. */
  function folderOf(folderId: string) {
    caller(ctx)
    const folder = world.folders.find((row) => row.id === folderId)
    if (folder === undefined) throw notFound()
    return { folder, ...workspaceOf(ctx, folder.workspaceId) }
  }

  return {
    listFolders: async ({ params: { path } }) => {
      workspaceOf(ctx, path.workspaceId)
      const folders = world.folders.filter((row) => row.workspaceId === path.workspaceId)
      return {
        items: sortRows(folders, { key: (row) => row.name, id: (row) => row.id, direction: 'asc' }).map(folderView),
      }
    },

    createFolder: async ({ params: { path }, body }) => {
      caller(ctx)
      checkTexts(['/name', body.name, textLimits.folderName])
      const { workspace } = workspaceOf(ctx, path.workspaceId)
      const at = world.now()
      const folder: FolderRecord = {
        id: world.newId(),
        workspaceId: workspace.id,
        name: body.name,
        revision: 1,
        createdAt: at,
        updatedAt: at,
      }
      world.folders.push(folder)
      return folderView(folder)
    },

    updateFolder: async ({ params: { path }, body }) => {
      caller(ctx)
      checkTexts(['/name', body.name, textLimits.folderName])
      const { folder } = folderOf(path.folderId)
      if (body.revision !== folder.revision) throw folderChanged(folderView(folder))
      if (body.name !== folder.name) {
        folder.name = body.name
        folder.revision += 1
        folder.updatedAt = world.now()
      }
      return folderView(folder)
    },

    deleteFolder: async ({ params: { path } }) => {
      const { folder, role } = folderOf(path.folderId)
      requireWorkspaceOwner(role)
      // Archived documents count: they still belong to the folder until someone deletes them.
      if (world.documents.some((document) => document.folderId === folder.id)) throw conflict()
      world.folders.splice(world.folders.indexOf(folder), 1)
    },
  }
}
