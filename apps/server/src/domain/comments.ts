import type { DocumentRole, Schema } from '@draftroom/contract'
import { can } from './permissions.ts'

// What a person may do to a comment, and what becomes of a thread. Reading and starting threads, replying, resolving and
// reopening need nothing but the role, so they are rows of `permissions.ts`; changing a comment also depends on who wrote
// it, which a role cannot say. The rows are the contract's (`edit-own-comment`, `delete-any-comment`).

export type CommentAction = 'edit' | 'delete'

export interface CommentSubject {
  /** The person's effective role on the document the comment belongs to. */
  readonly role: DocumentRole
  /** The person wrote the comment. */
  readonly isAuthor: boolean
}

/**
 * Whether the person may edit or delete the comment, once they can read it. Only the author edits. The author deletes too,
 * and so does an owner of the document, whoever wrote it. Being the author is not enough on its own: the role has to
 * still allow commenting, so someone demoted to viewer cannot touch what they wrote before.
 */
export function commentVerdict(action: CommentAction, { role, isAuthor }: CommentSubject): 'allowed' | 'forbidden' {
  const ownComment = isAuthor && can(role, 'edit-own-comment')
  const anyComment = action === 'delete' && can(role, 'delete-any-comment')
  return ownComment || anyComment ? 'allowed' : 'forbidden'
}

/** Deleting a comment keeps the rest of its thread; a thread left without comments goes with it. */
export const threadSurvives = (commentsLeft: number): boolean => commentsLeft > 0

type ActivityType = Schema<'ActivityType'>

/** The event the history records for each thing a person does to a thread. */
export const threadActivity = {
  create: 'thread.created',
  reply: 'thread.replied',
  resolve: 'thread.resolved',
  reopen: 'thread.reopened',
} as const satisfies Record<string, ActivityType>
