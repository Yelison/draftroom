import type { Schema } from '@draftroom/contract'
import type { DocumentRecord } from './fixtures/documents.ts'
import type { World } from './world.ts'

type DocumentRole = Schema<'DocumentRole'>
type WorkspaceRole = Schema<'WorkspaceRole'>

const rank: Record<DocumentRole, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 }

/** Whether `role` is at least `minimum`, in the order viewer < commenter < editor < owner. */
export const atLeast = (role: DocumentRole, minimum: DocumentRole): boolean => rank[role] >= rank[minimum]

export function workspaceRole(world: World, userId: string, workspaceId: string): WorkspaceRole | undefined {
  return world.memberships.find((row) => row.workspaceId === workspaceId && row.userId === userId)?.role
}

/**
 * The role a person has on a document, by the precedence of the contract: a workspace owner owns every document of the
 * workspace; anyone else has the higher of their own grant and the general access; a stranger has nothing. An archived
 * document is only visible to its owners. `undefined` means "cannot read it", which the API answers as `404`.
 */
export function documentRole(world: World, userId: string, document: DocumentRecord): DocumentRole | undefined {
  const inWorkspace = workspaceRole(world, userId, document.workspaceId)
  if (inWorkspace === undefined) return undefined
  const granted = world.grants.find((row) => row.documentId === document.id && row.userId === userId)?.role
  const general = document.generalAccess === 'none' ? undefined : document.generalAccess
  const candidates = [granted, general].filter((role): role is DocumentRole => role !== undefined)
  const role: DocumentRole | undefined =
    inWorkspace === 'owner' ? 'owner' : candidates.sort((a, b) => rank[b] - rank[a])[0]
  if (document.archivedAt !== null && role !== 'owner') return undefined
  return role
}
