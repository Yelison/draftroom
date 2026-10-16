import type { Insertable, Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database, ThreadsTable } from '../src/db/tables.ts'
import { addComment, anchor, createThread, quote } from './support/comments.ts'
import { createPopulatedWorkspace, createUser, type Workspace } from './support/fixtures.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'

// The tables of the comments hold the same promises as the rest of the schema (see `schema.test.ts`): a row cannot point
// at another workspace, and lengths count code points like the contract. These tests go to the tables with no route in
// between, so a rule is pinned in the database and not only in the application.

let database: TestDatabase
let db: Kysely<Database>
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
})
afterAll(async () => {
  await database.drop()
})

const foreignKeyViolation = '23503'
const checkViolation = '23514'
const refusedBy = (code: string, constraint: string) => expect.objectContaining({ code, constraint })

let a: Workspace
let b: Workspace
beforeAll(async () => {
  a = await createPopulatedWorkspace(db)
  b = await createPopulatedWorkspace(db)
})

const newThread = (changes: Partial<Insertable<ThreadsTable>> = {}) =>
  db
    .insertInto('threads')
    .values({
      workspace_id: a.id,
      document_id: a.documentId,
      anchor_start: anchor.start,
      anchor_end: anchor.end,
      quote,
      created_by: a.userId,
      resolved_at: null,
      resolved_by: null,
      ...changes,
    })
    .execute()

describe('a thread or a comment that points at another workspace', () => {
  it('is accepted inside the workspace, which is what makes the refusals below mean something', async () => {
    const { threadId } = await createThread(db, {
      workspaceId: a.id,
      documentId: a.documentId,
      author: { id: a.userId },
    })

    await expect(
      addComment(db, { workspaceId: a.id, threadId, author: { id: a.userId }, body: 'A reply' }),
    ).resolves.toBeDefined()
  })

  it('is refused for a thread on a document of another workspace', async () => {
    await expect(newThread({ workspace_id: b.id })).rejects.toEqual(
      refusedBy(foreignKeyViolation, 'threads_document_fkey'),
    )
  })

  it('is refused for a comment on a thread of another workspace', async () => {
    const { threadId } = await createThread(db, {
      workspaceId: a.id,
      documentId: a.documentId,
      author: { id: a.userId },
    })

    await expect(
      addComment(db, { workspaceId: b.id, threadId, author: { id: b.userId }, body: 'Hello' }),
    ).rejects.toEqual(refusedBy(foreignKeyViolation, 'comments_thread_fkey'))
  })
})

describe('what goes when something else goes', () => {
  it('removes the threads and comments of a deleted document', async () => {
    const workspace = await createPopulatedWorkspace(db)
    const { threadId, commentId } = await createThread(db, {
      workspaceId: workspace.id,
      documentId: workspace.documentId,
      author: { id: workspace.userId },
    })

    await db.deleteFrom('documents').where('id', '=', workspace.documentId).execute()

    const threads = await db.selectFrom('threads').select('id').where('id', '=', threadId).execute()
    const comments = await db.selectFrom('comments').select('id').where('id', '=', commentId).execute()
    expect([threads, comments]).toEqual([[], []])
  })

  it('removes the comments of a deleted thread and nothing else of the document', async () => {
    const workspace = await createPopulatedWorkspace(db)
    const kept = await createThread(db, {
      workspaceId: workspace.id,
      documentId: workspace.documentId,
      author: { id: workspace.userId },
    })
    const gone = await createThread(db, {
      workspaceId: workspace.id,
      documentId: workspace.documentId,
      author: { id: workspace.userId },
    })

    await db.deleteFrom('threads').where('id', '=', gone.threadId).execute()

    const left = await db.selectFrom('comments').select('id').where('workspace_id', '=', workspace.id).execute()
    expect(left).toEqual([{ id: kept.commentId }])
  })

  it('keeps what a member wrote after they leave the workspace', async () => {
    const workspace = await createPopulatedWorkspace(db)
    const member = await createUser(db)
    await db.insertInto('memberships').values({ workspace_id: workspace.id, user_id: member, role: 'member' }).execute()
    const { commentId } = await createThread(db, {
      workspaceId: workspace.id,
      documentId: workspace.documentId,
      author: { id: member },
    })

    await db.deleteFrom('memberships').where('workspace_id', '=', workspace.id).where('user_id', '=', member).execute()

    const comments = await db.selectFrom('comments').select('author_id').where('id', '=', commentId).execute()
    expect(comments).toEqual([{ author_id: member }])
  })
})

describe('the length of a text, in code points as the contract counts them', () => {
  it('lets a comment of 5000 emoji be written and refuses 5001', async () => {
    const { threadId } = await createThread(db, {
      workspaceId: a.id,
      documentId: a.documentId,
      author: { id: a.userId },
    })
    const write = (body: string) => addComment(db, { workspaceId: a.id, threadId, author: { id: a.userId }, body })

    await expect(write('😀'.repeat(5000))).resolves.toBeDefined()
    await expect(write('😀'.repeat(5001))).rejects.toEqual(refusedBy(checkViolation, 'comments_body_length'))
    await expect(write('')).rejects.toEqual(refusedBy(checkViolation, 'comments_body_length'))
  })

  it('lets a quote of 500 emoji be kept and refuses 501', async () => {
    await expect(newThread({ quote: '😀'.repeat(500) })).resolves.toBeDefined()
    await expect(newThread({ quote: '😀'.repeat(501) })).rejects.toEqual(
      refusedBy(checkViolation, 'threads_quote_length'),
    )
    await expect(newThread({ quote: '' })).rejects.toEqual(refusedBy(checkViolation, 'threads_quote_length'))
  })
})

describe('the anchor, which the database keeps without reading it', () => {
  it('accepts an end of 256 characters and refuses one of 257, the contract limit', async () => {
    await expect(newThread({ anchor_start: 'A'.repeat(256), anchor_end: 'A'.repeat(256) })).resolves.toBeDefined()
    await expect(newThread({ anchor_start: 'A'.repeat(257) })).rejects.toEqual(
      refusedBy(checkViolation, 'threads_anchor_start_valid'),
    )
    await expect(newThread({ anchor_end: 'A'.repeat(257) })).rejects.toEqual(
      refusedBy(checkViolation, 'threads_anchor_end_valid'),
    )
  })

  it('refuses an end that is not base64', async () => {
    await expect(newThread({ anchor_start: 'not base64!' })).rejects.toEqual(
      refusedBy(checkViolation, 'threads_anchor_start_valid'),
    )
    await expect(newThread({ anchor_end: '' })).rejects.toEqual(refusedBy(checkViolation, 'threads_anchor_end_valid'))
  })
})

describe('the state of a thread', () => {
  it('is resolved by someone and at some time, never one without the other', async () => {
    await expect(newThread({ resolved_at: new Date() })).rejects.toEqual(
      refusedBy(checkViolation, 'threads_resolved_together'),
    )
    await expect(newThread({ resolved_by: a.userId })).rejects.toEqual(
      refusedBy(checkViolation, 'threads_resolved_together'),
    )
    await expect(newThread({ resolved_at: new Date(), resolved_by: a.userId })).resolves.toBeDefined()
  })
})
