import type { Schema } from '@draftroom/contract'
import type { FastifyPluginCallback, FastifyRequest } from 'fastify'
import { getComment, getThread, listThreads } from '../../db/comments/queries.ts'
import { deleteComment, insertReply, insertThread, setResolved, updateCommentBody } from '../../db/comments/commands.ts'
import { commentVerdict, type CommentAction, type CommentSubject } from '../../domain/comments.ts'
import { principalOf } from '../auth/authenticate.ts'
import { authoriseComment, authoriseDocument, authoriseThread } from '../authorise.ts'
import { operationRoute } from '../operation-route.ts'
import { ProblemError } from '../problem.ts'
import { presentComment, presentThread } from '../presenters.ts'
import type { RouteDependencies } from './dependencies.ts'

// The order of the checks of docs/api/README.md is the order of each handler: the session and the shape of the request
// have been checked by the hooks of the app; then the thread or comment and the right to read it (404), the role (403),
// and only then what the request asks, so a person who cannot read a document never learns whether a thread of it exists.
//
// A write runs in one transaction with its event of the history, and is told to the connections of the document only
// once it has committed: a person who reacts to the notice and asks again must find the change there. Telling them is
// not part of the write, so a failure to do so is logged and the write stands.

export const commentRoutes: FastifyPluginCallback<RouteDependencies> = (
  app,
  { contract, database, broadcaster },
  done,
) => {
  const announce = (request: FastifyRequest, documentId: string, threadId: string): void => {
    try {
      broadcaster.broadcast(documentId, { type: 'comments-changed', threadId })
    } catch (error) {
      request.log.warn({ err: error, documentId, threadId }, 'comments-changed could not be broadcast')
    }
  }

  // A thread or a comment that vanished between the check and the write: the answer is the one for an id never there.
  const vanished = (): never => {
    throw new ProblemError('not-found')
  }

  const refuseUnless = (action: CommentAction, subject: CommentSubject): void => {
    if (commentVerdict(action, subject) === 'forbidden') throw new ProblemError('forbidden')
  }

  app.route(
    operationRoute(contract, 'listThreads', async (request): Promise<Schema<'ThreadList'>> => {
      const { userId } = principalOf(request)
      const { record } = await authoriseDocument(database, request.params.documentId, userId, 'read-comments', {
        onArchived: false,
      })
      const threads = await listThreads(database, {
        workspaceId: record.workspace_id,
        documentId: record.id,
        status: request.query.status,
      })
      return { items: threads.map(presentThread) }
    }),
  )

  app.route(
    operationRoute(contract, 'createThread', async (request, reply) => {
      const { userId } = principalOf(request)
      const { record } = await authoriseDocument(database, request.params.documentId, userId, 'write-comments', {
        onArchived: false,
      })
      const { anchor, quote, body } = request.body

      const thread = await database.transaction().execute(async (trx) => {
        const threadId = await insertThread(trx, {
          workspaceId: record.workspace_id,
          documentId: record.id,
          anchor,
          quote,
          body,
          authorId: userId,
        })
        return (await getThread(trx, threadId)) ?? vanished()
      })
      announce(request, record.id, thread.id)
      return reply.code(201).send(presentThread(thread))
    }),
  )

  app.route(
    operationRoute(contract, 'replyToThread', async (request, reply) => {
      const { userId } = principalOf(request)
      const { thread } = await authoriseThread(database, request.params.threadId, userId, 'write-comments')

      const comment = await database.transaction().execute(async (trx) => {
        const commentId = await insertReply(trx, { threadId: thread.id, body: request.body.body, authorId: userId })
        return commentId === undefined ? vanished() : ((await getComment(trx, commentId)) ?? vanished())
      })
      announce(request, thread.document_id, thread.id)
      return reply.code(201).send(presentComment(comment))
    }),
  )

  for (const [operationId, resolve] of [
    ['resolveThread', true],
    ['reopenThread', false],
  ] as const) {
    app.route(
      operationRoute(contract, operationId, async (request): Promise<Schema<'Thread'>> => {
        const { userId } = principalOf(request)
        // The role is checked before the thread is found to be in the state asked for: whoever may not resolve a thread
        // is refused even when it is already resolved, and is not told how it stands by an answer that would succeed.
        const { thread } = await authoriseThread(database, request.params.threadId, userId, 'write-comments')

        const { change, record } = await database.transaction().execute(async (trx) => {
          const change = await setResolved(trx, { threadId: thread.id, actorId: userId, resolve })
          if (change === 'missing') return vanished()
          return { change, record: (await getThread(trx, thread.id)) ?? vanished() }
        })
        if (change === 'changed') announce(request, thread.document_id, thread.id)
        return presentThread(record)
      }),
    )
  }

  app.route(
    operationRoute(contract, 'updateComment', async (request): Promise<Schema<'Comment'>> => {
      const { userId } = principalOf(request)
      const { comment, document } = await authoriseComment(database, request.params.commentId, userId)
      refuseUnless('edit', { role: document.role, isAuthor: comment.author_id === userId })

      const { change, record } = await database.transaction().execute(async (trx) => {
        const change = await updateCommentBody(trx, { commentId: comment.comment_id, body: request.body.body })
        if (change === 'missing') return vanished()
        return { change, record: (await getComment(trx, comment.comment_id)) ?? vanished() }
      })
      if (change === 'changed') announce(request, comment.document_id, comment.thread_id)
      return presentComment(record)
    }),
  )

  app.route(
    operationRoute(contract, 'deleteComment', async (request, reply) => {
      const { userId } = principalOf(request)
      const { comment, document } = await authoriseComment(database, request.params.commentId, userId)
      refuseUnless('delete', { role: document.role, isAuthor: comment.author_id === userId })

      const result = await database.transaction().execute((trx) => deleteComment(trx, comment.comment_id))
      if (result === 'missing') vanished()
      // Even when the thread went with its last comment: the people who have it open still hold it and must drop it.
      announce(request, comment.document_id, comment.thread_id)
      return reply.code(204).send()
    }),
  )

  done()
}
