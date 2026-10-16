import type { DocumentRole, GeneralAccess, WorkspaceRole } from '@draftroom/contract'

// Who may do what, as a pure function of facts the caller loaded: no database, no request. The rules are plan §4.3 and
// ADR 0005; the operations are named after the rows of the contract's `x-draftroom-roles`, so the table below reads
// against the contract file and the later tasks (comments, access, versions) add their rows to the same table.

const documentRoles = ['viewer', 'commenter', 'editor', 'owner'] as const satisfies readonly DocumentRole[]

// A role includes the ones before it: an editor can do whatever a commenter can.
const rank: Readonly<Record<DocumentRole, number>> = { viewer: 1, commenter: 2, editor: 3, owner: 4 }

const higher = (first: DocumentRole | null, second: DocumentRole | null): DocumentRole | null => {
  if (first === null) return second
  if (second === null) return first
  return rank[first] >= rank[second] ? first : second
}

export interface RoleFacts {
  /** The person's role in the workspace of the document, `null` for someone who does not belong to it. */
  readonly workspaceRole: WorkspaceRole | null
  /** The person's explicit grant on the document, if any. */
  readonly grant: DocumentRole | null
  readonly generalAccess: GeneralAccess
}

/**
 * The role a person has on a document, or `null` when they have none and so cannot even know it exists.
 *
 * A workspace owner owns every document of the workspace. Anyone else has the higher of their explicit grant and the
 * document's general access, which applies to every member. A person outside the workspace has nothing, whatever a
 * stale grant says: the workspace is the boundary.
 */
export function effectiveRole({ workspaceRole, grant, generalAccess }: RoleFacts): DocumentRole | null {
  if (workspaceRole === null) return null
  if (workspaceRole === 'owner') return 'owner'
  return higher(grant, generalAccess === 'none' ? null : generalAccess)
}

const everyone = documentRoles
const commenters = ['commenter', 'editor', 'owner'] as const
const editors = ['editor', 'owner'] as const
const owners = ['owner'] as const

/** The rows of the matrix that a document role decides on its own. */
const documentMatrix = {
  read: everyone,
  'write-content': editors,
  'read-comments': everyone,
  'write-comments': commenters,
  'edit-own-comment': commenters,
  'delete-any-comment': owners,
  'rename-move': editors,
  'create-version': editors,
  'read-versions': everyone,
  'restore-version': owners,
  'manage-access': owners,
  'archive-delete': owners,
  pin: everyone,
} as const satisfies Record<string, readonly DocumentRole[]>

export type DocumentOperation = keyof typeof documentMatrix

/** Whether a role may do an operation. No role, and any operation the table does not list, is refused. */
export function can(role: DocumentRole | null, operation: DocumentOperation): boolean {
  if (role === null) return false
  const allowed: readonly DocumentRole[] | undefined = documentMatrix[operation]
  return allowed?.includes(role) ?? false
}

const workspaceMatrix = {
  'workspace-read': ['member', 'owner'],
  'create-content': ['member', 'owner'],
  'rename-folder': ['member', 'owner'],
  'delete-folder': ['owner'],
  'manage-members': ['owner'],
  'rename-workspace': ['owner'],
} as const satisfies Record<string, readonly WorkspaceRole[]>

export type WorkspaceOperation = keyof typeof workspaceMatrix

/** The workspace rows of the matrix, which use the person's workspace role. */
export function canInWorkspace(role: WorkspaceRole | null, operation: WorkspaceOperation): boolean {
  if (role === null) return false
  const allowed: readonly WorkspaceRole[] | undefined = workspaceMatrix[operation]
  return allowed?.includes(role) ?? false
}

/**
 * What a request may do to a document it names, once the document is found: steps 4 and 5 of the order of checks.
 * `not-found` is for anyone who may not read it, answered exactly as for a document that does not exist; `forbidden`
 * is only for someone who can read it and may not do this.
 */
export type Verdict = 'allowed' | 'not-found' | 'forbidden'

export interface Subject {
  readonly role: DocumentRole | null
  readonly archived: boolean
}

/**
 * An archived document is readable only by its owners, to restore or delete it, and every other operation on it is
 * `not-found` for everyone, its owners included. `onArchived` marks the operations that still apply to one.
 */
export function verdictFor(
  { role, archived }: Subject,
  operation: DocumentOperation,
  { onArchived }: { readonly onArchived: boolean },
): Verdict {
  if (role === null) return 'not-found'
  if (archived && (role !== 'owner' || !onArchived)) return 'not-found'
  return can(role, operation) ? 'allowed' : 'forbidden'
}
