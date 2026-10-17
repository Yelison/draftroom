import type { Schema } from '@draftroom/contract'
import type { ThreadRecord, VersionRecord, ActivityRecord } from './fixtures/collaboration.ts'
import type { DocumentRecord, GrantRecord } from './fixtures/documents.ts'
import type { PersonRecord } from './fixtures/people.ts'
import type { FolderRecord, MembershipRecord, WorkspaceRecord } from './fixtures/workspaces.ts'
import { documentRole } from './roles.ts'
import type { World } from './world.ts'

// The records a mock keeps are not the shapes of the contract: these functions turn one into the other, the way the
// server's serialisers do, so what leaves the mock is what `openapi.yaml` describes.

export function userRef(world: World, userId: string): Schema<'UserRef'> {
  const person = world.people.find((row) => row.id === userId)
  if (person === undefined) throw new Error(`The mock has no person ${userId}`)
  return { id: person.id, name: person.name ?? person.email }
}

export function meView({ id, email, name, locale, editorTextSize }: PersonRecord): Schema<'Me'> {
  return { id, email, name: name ?? email, locale, editorTextSize }
}

export function workspaceView(workspace: WorkspaceRecord, role: Schema<'WorkspaceRole'>): Schema<'Workspace'> {
  return { id: workspace.id, name: workspace.name, role, createdAt: workspace.createdAt }
}

export function memberView(world: World, membership: MembershipRecord): Schema<'Member'> {
  const person = world.people.find((row) => row.id === membership.userId)
  if (person === undefined) throw new Error(`The mock has no person ${membership.userId}`)
  const pending = person.password === null
  return {
    userId: person.id,
    email: person.email,
    name: pending ? null : person.name,
    role: membership.role,
    status: pending ? 'pending' : 'active',
    createdAt: membership.createdAt,
  }
}

export function folderView(folder: FolderRecord): Schema<'Folder'> {
  return { ...folder }
}

/** The document as `viewerId` sees it: their role, their pin, and the sharing settings only if they own it. */
export function documentView(world: World, document: DocumentRecord, viewerId: string): Schema<'Document'> {
  const role = documentRole(world, viewerId, document)
  if (role === undefined) throw new Error('A document is only shown to someone who can read it')
  return {
    id: document.id,
    workspaceId: document.workspaceId,
    folderId: document.folderId,
    title: document.title,
    excerpt: document.excerpt,
    revision: document.revision,
    role,
    generalAccess: role === 'owner' ? document.generalAccess : null,
    pinned: world.pins.some((pin) => pin.userId === viewerId && pin.documentId === document.id),
    createdBy: userRef(world, document.createdBy),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    archivedAt: document.archivedAt,
  }
}

export function accessEntryView(world: World, grant: GrantRecord): Schema<'AccessEntry'> {
  const person = world.people.find((row) => row.id === grant.userId)
  if (person === undefined) throw new Error(`The mock has no person ${grant.userId}`)
  return {
    userId: person.id,
    email: person.email,
    name: person.password === null ? null : person.name,
    role: grant.role,
    createdAt: grant.createdAt,
  }
}

export function threadView(world: World, thread: ThreadRecord): Schema<'Thread'> {
  return {
    id: thread.id,
    documentId: thread.documentId,
    status: thread.status,
    anchor: { ...thread.anchor },
    quote: thread.quote,
    createdBy: userRef(world, thread.createdBy),
    createdAt: thread.createdAt,
    resolvedAt: thread.resolvedAt,
    resolvedBy: thread.resolvedBy === null ? null : userRef(world, thread.resolvedBy),
    comments: thread.comments.map((comment) => commentView(world, thread.id, comment)),
  }
}

export function commentView(
  world: World,
  threadId: string,
  comment: ThreadRecord['comments'][number],
): Schema<'Comment'> {
  return {
    id: comment.id,
    threadId,
    author: userRef(world, comment.authorId),
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  }
}

export function versionView(world: World, version: VersionRecord): Schema<'Version'> {
  return {
    id: version.id,
    documentId: version.documentId,
    kind: version.kind,
    label: version.label,
    createdBy: version.createdBy === null ? null : userRef(world, version.createdBy),
    createdAt: version.createdAt,
    sizeBytes: version.sizeBytes,
  }
}

export function activityView(world: World, event: ActivityRecord, document: DocumentRecord): Schema<'ActivityEvent'> {
  return {
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
    actor: event.actorId === null ? null : userRef(world, event.actorId),
    document: { id: document.id, title: document.title },
    targetUser: event.targetUserId === null ? null : userRef(world, event.targetUserId),
  }
}
