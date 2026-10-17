import type { DocumentRole, Schema } from '@draftroom/contract'

/**
 * Whether the role may write comments: start a thread, reply, resolve and reopen. A commenter may, whatever the editor
 * allows: the comments are the server's and never go through the shared text. This only decides what the screen offers;
 * the server refuses what a role may not do.
 */
export const canComment = (role: DocumentRole): boolean => role !== 'viewer'

/** Only the author edits a comment, and only while their role still lets them write one. */
export const canEditComment = (role: DocumentRole, comment: Schema<'Comment'>, personId: string): boolean =>
  canComment(role) && comment.author.id === personId

/** The author deletes their own comment and an owner deletes anyone's. */
export const canDeleteComment = (role: DocumentRole, comment: Schema<'Comment'>, personId: string): boolean =>
  canComment(role) && (comment.author.id === personId || role === 'owner')
