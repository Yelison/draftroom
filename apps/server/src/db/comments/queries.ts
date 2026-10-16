import type { Kysely } from 'kysely'
import type { Database } from '../tables.ts'

// The reads of threads and comments. A thread comes with its comments and with the names of the people in it, which is
// the shape the contract serves; whether the caller may read the document it belongs to is decided before, from the
// location these queries give.

export interface PersonRef {
  readonly id: string
  readonly name: string | null
}

export interface CommentRecord {
  readonly id: string
  readonly thread_id: string
  readonly author: PersonRef
  readonly body: string
  readonly created_at: Date
  readonly updated_at: Date
}

export interface ThreadRecord {
  readonly id: string
  readonly document_id: string
  readonly anchor_start: string
  readonly anchor_end: string
  readonly quote: string
  readonly created_at: Date
  readonly resolved_at: Date | null
  readonly creator: PersonRef
  /** `null` while the thread is open. */
  readonly resolver: PersonRef | null
  /** Oldest first. */
  readonly comments: readonly CommentRecord[]
}

/** Where a thread lives: enough to ask whether the caller may read its document. */
export interface ThreadLocation {
  readonly id: string
  readonly workspace_id: string
  readonly document_id: string
}

/** Where a comment lives, and who wrote it. */
export interface CommentLocation {
  readonly comment_id: string
  readonly thread_id: string
  readonly workspace_id: string
  readonly document_id: string
  readonly author_id: string
}

/** The thread, wherever it is, or nothing when it does not exist. It says nothing of whether anyone may read it. */
export function findThread(db: Kysely<Database>, threadId: string): Promise<ThreadLocation | undefined> {
  return db
    .selectFrom('threads')
    .select(['id', 'workspace_id', 'document_id'])
    .where('id', '=', threadId)
    .executeTakeFirst()
}

/** The comment with the thread it belongs to, or nothing when it does not exist. */
export function findComment(db: Kysely<Database>, commentId: string): Promise<CommentLocation | undefined> {
  return db
    .selectFrom('comments as c')
    .innerJoin('threads as t', (join) =>
      join.onRef('t.workspace_id', '=', 'c.workspace_id').onRef('t.id', '=', 'c.thread_id'),
    )
    .select(['c.id as comment_id', 't.id as thread_id', 't.workspace_id', 't.document_id', 'c.author_id'])
    .where('c.id', '=', commentId)
    .executeTakeFirst()
}

const commentColumns = ['c.id', 'c.thread_id', 'c.body', 'c.created_at', 'c.updated_at'] as const

function commentsQuery(db: Kysely<Database>) {
  return db
    .selectFrom('comments as c')
    .innerJoin('users as author', 'author.id', 'c.author_id')
    .select([...commentColumns, 'author.id as authorId', 'author.name as authorName'])
}

type CommentRow = Awaited<ReturnType<ReturnType<typeof commentsQuery>['executeTakeFirstOrThrow']>>

const toComment = ({ authorId, authorName, ...row }: CommentRow): CommentRecord => ({
  ...row,
  author: { id: authorId, name: authorName },
})

export async function getComment(db: Kysely<Database>, commentId: string): Promise<CommentRecord | undefined> {
  const row = await commentsQuery(db).where('c.id', '=', commentId).executeTakeFirst()
  return row === undefined ? undefined : toComment(row)
}

function threadsQuery(db: Kysely<Database>) {
  return db
    .selectFrom('threads as t')
    .innerJoin('users as creator', 'creator.id', 't.created_by')
    .leftJoin('users as resolver', 'resolver.id', 't.resolved_by')
    .select([
      't.id',
      't.document_id',
      't.anchor_start',
      't.anchor_end',
      't.quote',
      't.created_at',
      't.resolved_at',
      'creator.id as creatorId',
      'creator.name as creatorName',
      'resolver.id as resolverId',
      'resolver.name as resolverName',
    ])
}

type ThreadRow = Awaited<ReturnType<ReturnType<typeof threadsQuery>['executeTakeFirstOrThrow']>>

/** The threads with their comments, in two queries however many there are. */
async function withComments(db: Kysely<Database>, rows: readonly ThreadRow[]): Promise<ThreadRecord[]> {
  if (rows.length === 0) return []
  const comments = await commentsQuery(db)
    .where(
      'c.thread_id',
      'in',
      rows.map((row) => row.id),
    )
    .orderBy('c.created_at', 'asc')
    .orderBy('c.id', 'asc')
    .execute()
  const byThread = new Map<string, CommentRecord[]>()
  for (const comment of comments.map(toComment)) {
    byThread.set(comment.thread_id, [...(byThread.get(comment.thread_id) ?? []), comment])
  }
  return rows.map(({ creatorId, creatorName, resolverId, resolverName, ...row }) => ({
    ...row,
    creator: { id: creatorId, name: creatorName },
    resolver: resolverId === null ? null : { id: resolverId, name: resolverName },
    comments: byThread.get(row.id) ?? [],
  }))
}

export interface ThreadFilter {
  readonly documentId: string
  /** Only the threads that are open or only those that are resolved; both when left out. */
  readonly status?: 'open' | 'resolved' | undefined
}

/** The threads of a document, oldest first, ties by id. */
export async function listThreads(db: Kysely<Database>, { documentId, status }: ThreadFilter): Promise<ThreadRecord[]> {
  let query = threadsQuery(db).where('t.document_id', '=', documentId)
  if (status !== undefined) query = query.where('t.resolved_at', status === 'open' ? 'is' : 'is not', null)
  return withComments(db, await query.orderBy('t.created_at', 'asc').orderBy('t.id', 'asc').execute())
}

export async function getThread(db: Kysely<Database>, threadId: string): Promise<ThreadRecord | undefined> {
  const rows = await threadsQuery(db).where('t.id', '=', threadId).execute()
  return (await withComments(db, rows))[0]
}
