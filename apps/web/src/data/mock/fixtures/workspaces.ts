import type { Schema } from '@draftroom/contract'
import { seedId } from '../ids.ts'
import { ana, daniel, marta, sofia, wei } from './people.ts'

export interface WorkspaceRecord {
  id: string
  name: string
  createdAt: string
}

export interface MembershipRecord {
  workspaceId: string
  userId: string
  role: Schema<'WorkspaceRole'>
  createdAt: string
}

export interface FolderRecord {
  id: string
  workspaceId: string
  name: string
  revision: number
  createdAt: string
  updatedAt: string
}

export const harborPine: WorkspaceRecord = {
  id: seedId(2, 1),
  name: 'Harbor Pine',
  createdAt: '2026-08-03T08:00:00.000Z',
}
/** A second workspace, where Marta is not a member: what she must not be able to read. */
export const lanternStudio: WorkspaceRecord = {
  id: seedId(2, 2),
  name: 'Lantern Studio',
  createdAt: '2026-08-20T10:30:00.000Z',
}

export const workspaces: readonly WorkspaceRecord[] = [harborPine, lanternStudio]

export const memberships: readonly MembershipRecord[] = [
  { workspaceId: harborPine.id, userId: marta.id, role: 'owner', createdAt: '2026-08-03T08:00:00.000Z' },
  { workspaceId: harborPine.id, userId: daniel.id, role: 'member', createdAt: '2026-08-03T09:15:00.000Z' },
  { workspaceId: harborPine.id, userId: sofia.id, role: 'member', createdAt: '2026-08-10T14:00:00.000Z' },
  { workspaceId: harborPine.id, userId: ana.id, role: 'member', createdAt: '2026-10-09T16:45:00.000Z' },
  { workspaceId: lanternStudio.id, userId: wei.id, role: 'owner', createdAt: '2026-08-20T10:30:00.000Z' },
  { workspaceId: lanternStudio.id, userId: daniel.id, role: 'member', createdAt: '2026-09-01T09:00:00.000Z' },
]

const folder = (index: number, name: string, createdAt: string): FolderRecord => ({
  id: seedId(3, index),
  workspaceId: harborPine.id,
  name,
  revision: 1,
  createdAt,
  updatedAt: createdAt,
})

export const productFolder = folder(1, 'Product', '2026-08-04T09:00:00.000Z')
export const researchFolder = folder(2, 'Research', '2026-08-12T11:20:00.000Z')
export const operationsFolder = folder(3, 'Operaciones', '2026-09-02T08:40:00.000Z')

/** The only folder with nothing in it: the one a test can delete. */
export const ideasFolder = folder(4, 'Ideas', '2026-09-20T10:00:00.000Z')

export const folders: readonly FolderRecord[] = [productFolder, researchFolder, operationsFolder, ideasFolder]
