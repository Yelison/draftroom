import { sql, type Transaction } from 'kysely'
import { threadActivity, threadSurvives } from '../../domain/comments.ts'
import { recordActivity } from '../activity.ts'
import type { Database } from '../tables.ts'

// The writes of threads and comments. The callers run them in a transaction, and each one that changes a thread also
// appends its event to the history there, so neither exists alone.
//
// Every write that depends on what a thread holds starts by locking the thread's row. Two people deleting the last two
// comments of a thread at once would otherwise each see the other's comment still there and leave an empty thread
// behind, and a reply would land on a thread that is being deleted. Once the lock is taken, the writes of the others
// wait, and the next statement sees what they committed. A thread that is gone by then is `missing`, which the caller
// answers as a thread that was never there.

async function lockThread(trx: Transaction<Database>, threadId: string) {
  return trx
    .selectFrom('threads')
    .select(['id', 'workspace_id', 'document_id', 'resolved_at'])
    .where('id', '=', threadId)
    .forUpdate()
    .executeTakeFirst()
}

export interface NewThread {
  readonly workspaceId: string
  readonly documentId: string
  readonly anchor: { readonly start: string; readonly end: string }
  readonly quote: string
  /** The first comment, written by the person who starts the thread. */
  readonly body: string
  readonly authorId: string
}

/** Starts a thread with its first comment, and records that it was started. Gives the id of the thread. */
export async function insertThread(trx: Transaction<Database>, thread: NewThread): Promise<string> {
  const { id } = await trx
    .insertInto('threads')
    .values({
      workspace_id: thread.workspaceId,
      document_id: thread.documentId,
      anchor_start: thread.anchor.start,
      anchor_end: thread.anchor.end,
      quote: thread.quote,
      created_by: thread.authorId,
      resolved_at: null,
      resolved_by: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await trx
    .insertInto('comments')
    .values({ workspace_id: thread.workspaceId, thread_id: id, author_id: thread.authorId, body: thread.body })
    .execute()
  await recordActivity(trx, [
    {
      workspaceId: thread.workspaceId,
      documentId: thread.documentId,
      type: threadActivity.create,
      actorId: thread.authorId,
    },
  ])
  return id
}

export interface NewReply {
  readonly threadId: string
  readonly body: string
  readonly authorId: string
}

/** Adds a comment to a thread and records the reply. Gives the id of the comment, or nothing when the thread is gone. */
export async function insertReply(trx: Transaction<Database>, reply: NewReply): Promise<string | undefined> {
  const thread = await lockThread(trx, reply.threadId)
  if (thread === undefined) return undefined
  const { id } = await trx
    .insertInto('comments')
    .values({
      workspace_id: thread.workspace_id,
      thread_id: thread.id,
      author_id: reply.authorId,
      body: reply.body,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await recordActivity(trx, [
    {
      workspaceId: thread.workspace_id,
      documentId: thread.document_id,
      type: threadActivity.reply,
      actorId: reply.authorId,
    },
  ])
  return id
}

/** What a write did to a row: it was not there, it was already as asked, or it changed. */
export type Change = 'missing' | 'unchanged' | 'changed'

export interface ResolveChange {
  readonly threadId: string
  readonly actorId: string
  /** `true` to resolve the thread, `false` to reopen it. */
  readonly resolve: boolean
}

/**
 * Resolves or reopens a thread. A thread already in that state is left as it is, who resolved it and when included, and
 * records nothing: that is what makes both operations idempotent.
 */
export async function setResolved(trx: Transaction<Database>, change: ResolveChange): Promise<Change> {
  const thread = await lockThread(trx, change.threadId)
  if (thread === undefined) return 'missing'
  if ((thread.resolved_at !== null) === change.resolve) return 'unchanged'
  await trx
    .updateTable('threads')
    .set(
      change.resolve
        ? { resolved_at: sql`now()`, resolved_by: change.actorId }
        : { resolved_at: null, resolved_by: null },
    )
    .where('id', '=', thread.id)
    .execute()
  await recordActivity(trx, [
    {
      workspaceId: thread.workspace_id,
      documentId: thread.document_id,
      type: change.resolve ? threadActivity.resolve : threadActivity.reopen,
      actorId: change.actorId,
    },
  ])
  return 'changed'
}

/** Replaces the text of a comment. The same text is not an edit: the comment keeps the time it was last changed. */
export async function updateCommentBody(
  trx: Transaction<Database>,
  change: { readonly commentId: string; readonly body: string },
): Promise<Change> {
  const comment = await trx
    .selectFrom('comments')
    .select(['id', 'body'])
    .where('id', '=', change.commentId)
    .forUpdate()
    .executeTakeFirst()
  if (comment === undefined) return 'missing'
  if (comment.body === change.body) return 'unchanged'
  await trx
    .updateTable('comments')
    .set({ body: change.body, updated_at: sql`now()` })
    .where('id', '=', comment.id)
    .execute()
  return 'changed'
}

/** Deletes a comment, and the thread with it when it was the last one. */
export async function deleteComment(trx: Transaction<Database>, commentId: string): Promise<'missing' | 'deleted'> {
  const comment = await trx.selectFrom('comments').select('thread_id').where('id', '=', commentId).executeTakeFirst()
  if (comment === undefined) return 'missing'
  // The lock comes before the delete and the count, so that whoever deletes next counts what this one left.
  if ((await lockThread(trx, comment.thread_id)) === undefined) return 'missing'
  const deleted = await trx.deleteFrom('comments').where('id', '=', commentId).returning('id').executeTakeFirst()
  if (deleted === undefined) return 'missing'
  const { left } = await trx
    .selectFrom('comments')
    .select((eb) => eb.fn.countAll<string>().as('left'))
    .where('thread_id', '=', comment.thread_id)
    .executeTakeFirstOrThrow()
  if (!threadSurvives(Number(left))) await trx.deleteFrom('threads').where('id', '=', comment.thread_id).execute()
  return 'deleted'
}
