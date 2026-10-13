import type { DataSource } from '../../DataSource.ts'
import type { ThreadRecord } from '../fixtures/collaboration.ts'
import { record } from '../events.ts'
import { caller, documentOf, requireRole, type Context } from '../guards.ts'
import { textLimits } from '../limits.ts'
import { sortRows } from '../pagination.ts'
import { forbidden, notFound } from '../problems.ts'
import { checkTexts } from '../text.ts'
import { commentView, threadView } from '../views.ts'

type ThreadOperations = Pick<
  DataSource,
  | 'listThreads'
  | 'createThread'
  | 'replyToThread'
  | 'resolveThread'
  | 'reopenThread'
  | 'updateComment'
  | 'deleteComment'
>

export function threadOperations(ctx: Context): ThreadOperations {
  const { world } = ctx

  /** A thread of a document the caller can read; any other is as good as missing. */
  function threadOf(threadId: string) {
    caller(ctx)
    const thread = world.threads.find((row) => row.id === threadId)
    if (thread === undefined) throw notFound()
    return { thread, ...documentOf(ctx, thread.documentId) }
  }

  function commentOf(commentId: string) {
    caller(ctx)
    const thread = world.threads.find((row) => row.comments.some((comment) => comment.id === commentId))
    const comment = thread?.comments.find((row) => row.id === commentId)
    if (thread === undefined || comment === undefined) throw notFound()
    return { thread, comment, ...documentOf(ctx, thread.documentId) }
  }

  /** Resolving and reopening are idempotent: only a real change is written down. */
  function setStatus(thread: ThreadRecord, status: ThreadRecord['status'], userId: string) {
    if (thread.status === status) return
    thread.status = status
    thread.resolvedAt = status === 'resolved' ? world.now() : null
    thread.resolvedBy = status === 'resolved' ? userId : null
    record(world, status === 'resolved' ? 'thread.resolved' : 'thread.reopened', userId, thread.documentId)
  }

  return {
    listThreads: async ({ params: { path, query = {} } }) => {
      caller(ctx)
      const { document } = documentOf(ctx, path.documentId)
      const threads = world.threads.filter(
        (row) => row.documentId === document.id && (query.status === undefined || row.status === query.status),
      )
      return {
        items: sortRows(threads, { key: (row) => row.createdAt, id: (row) => row.id, direction: 'asc' }).map((row) =>
          threadView(world, row),
        ),
      }
    },

    createThread: async ({ params: { path }, body }) => {
      const user = caller(ctx)
      checkTexts(['/quote', body.quote, textLimits.quote], ['/body', body.body, textLimits.commentBody])
      const { document, role } = documentOf(ctx, path.documentId)
      requireRole(role, 'commenter')

      const at = world.now()
      const thread: ThreadRecord = {
        id: world.newId(),
        documentId: document.id,
        status: 'open',
        anchor: { ...body.anchor },
        quote: body.quote,
        createdBy: user.id,
        createdAt: at,
        resolvedAt: null,
        resolvedBy: null,
        comments: [{ id: world.newId(), authorId: user.id, body: body.body, createdAt: at, updatedAt: at }],
      }
      world.threads.push(thread)
      record(world, 'thread.created', user.id, document.id)
      return threadView(world, thread)
    },

    replyToThread: async ({ params: { path }, body }) => {
      const user = caller(ctx)
      checkTexts(['/body', body.body, textLimits.commentBody])
      const { thread, role } = threadOf(path.threadId)
      requireRole(role, 'commenter')

      const at = world.now()
      const reply = { id: world.newId(), authorId: user.id, body: body.body, createdAt: at, updatedAt: at }
      thread.comments.push(reply)
      record(world, 'thread.replied', user.id, thread.documentId)
      return commentView(world, thread.id, reply)
    },

    resolveThread: async ({ params: { path } }) => {
      const user = caller(ctx)
      const { thread, role } = threadOf(path.threadId)
      requireRole(role, 'commenter')
      setStatus(thread, 'resolved', user.id)
      return threadView(world, thread)
    },

    reopenThread: async ({ params: { path } }) => {
      const user = caller(ctx)
      const { thread, role } = threadOf(path.threadId)
      requireRole(role, 'commenter')
      setStatus(thread, 'open', user.id)
      return threadView(world, thread)
    },

    updateComment: async ({ params: { path }, body }) => {
      const user = caller(ctx)
      checkTexts(['/body', body.body, textLimits.commentBody])
      const { thread, comment, role } = commentOf(path.commentId)
      // Writing comments needs a role that allows it, even for the author of one written when theirs was higher; and
      // only the author edits: anyone else who can read the thread is refused, not told it is missing.
      requireRole(role, 'commenter')
      if (comment.authorId !== user.id) throw forbidden()
      comment.body = body.body
      comment.updatedAt = world.now()
      return commentView(world, thread.id, comment)
    },

    deleteComment: async ({ params: { path } }) => {
      const user = caller(ctx)
      const { thread, comment, role } = commentOf(path.commentId)
      requireRole(role, 'commenter')
      if (comment.authorId !== user.id) requireRole(role, 'owner')
      thread.comments.splice(thread.comments.indexOf(comment), 1)
      // A thread left without comments goes with it.
      if (thread.comments.length === 0) world.threads.splice(world.threads.indexOf(thread), 1)
    },
  }
}
