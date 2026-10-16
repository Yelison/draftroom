import type { Kysely } from 'kysely'
import type { Database } from '../../src/db/tables.ts'

// Threads and comments for the tests, inserted straight into the tables, not through the routes under test. A thread
// is one a person started, with their first comment, as the API makes them.

/** Two encoded relative positions, the ones of the contract's example: the server never decodes them. */
export const anchor = { start: 'AbL6hNcDAQ==', end: 'AbL6hNcDCw==' } as const

export const quote = 'second week of November'

export interface NewThread {
  readonly workspaceId: string
  readonly documentId: string
  readonly author: { readonly id: string }
  readonly body?: string
  /** The person who resolved it, if it is resolved. */
  readonly resolvedBy?: { readonly id: string }
}

export interface ThreadFixture {
  readonly threadId: string
  /** The comment that started the thread. */
  readonly commentId: string
}

export async function createThread(db: Kysely<Database>, thread: NewThread): Promise<ThreadFixture> {
  const { id: threadId } = await db
    .insertInto('threads')
    .values({
      workspace_id: thread.workspaceId,
      document_id: thread.documentId,
      anchor_start: anchor.start,
      anchor_end: anchor.end,
      quote,
      created_by: thread.author.id,
      resolved_at: thread.resolvedBy === undefined ? null : new Date(),
      resolved_by: thread.resolvedBy?.id ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const commentId = await addComment(db, {
    workspaceId: thread.workspaceId,
    threadId,
    author: thread.author,
    body: thread.body ?? 'Does the workshop fit before then?',
  })
  return { threadId, commentId }
}

export async function addComment(
  db: Kysely<Database>,
  comment: {
    readonly workspaceId: string
    readonly threadId: string
    readonly author: { readonly id: string }
    readonly body: string
  },
): Promise<string> {
  const { id } = await db
    .insertInto('comments')
    .values({
      workspace_id: comment.workspaceId,
      thread_id: comment.threadId,
      author_id: comment.author.id,
      body: comment.body,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return id
}

/** What the comment tables and the history hold, to say that a request that was refused changed none of it. */
export interface CommentTableCounts {
  readonly threads: number
  readonly comments: number
  readonly threadEvents: number
}

export async function commentTableCounts(db: Kysely<Database>): Promise<CommentTableCounts> {
  const count = async (table: 'threads' | 'comments'): Promise<number> => {
    const { total } = await db
      .selectFrom(table)
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow()
    return Number(total)
  }
  const { total: events } = await db
    .selectFrom('activity_events')
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .where('type', 'in', ['thread.created', 'thread.replied', 'thread.resolved', 'thread.reopened'])
    .executeTakeFirstOrThrow()
  return { threads: await count('threads'), comments: await count('comments'), threadEvents: Number(events) }
}
