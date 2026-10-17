import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'

/** The six things a person does to the threads of a document; each leaves stale what the table of the API says. */
export function useThreadActions(document: Pick<Schema<'Document'>, 'id' | 'workspaceId'>) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const scope = { workspaceId: document.workspaceId, documentId: document.id }

  return {
    createThread: useMutation({
      mutationFn: (body: Schema<'CreateThreadRequest'>) =>
        dataSource.createThread({ params: { path: { documentId: document.id } }, body }),
      onSuccess: () => invalidateAfter(queryClient, 'createThread', scope),
    }),
    replyToThread: useMutation({
      mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
        dataSource.replyToThread({ params: { path: { threadId } }, body: { body } }),
      onSuccess: () => invalidateAfter(queryClient, 'replyToThread', scope),
    }),
    resolveThread: useMutation({
      mutationFn: (threadId: string) => dataSource.resolveThread({ params: { path: { threadId } } }),
      onSuccess: () => invalidateAfter(queryClient, 'resolveThread', scope),
    }),
    reopenThread: useMutation({
      mutationFn: (threadId: string) => dataSource.reopenThread({ params: { path: { threadId } } }),
      onSuccess: () => invalidateAfter(queryClient, 'reopenThread', scope),
    }),
    updateComment: useMutation({
      mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
        dataSource.updateComment({ params: { path: { commentId } }, body: { body } }),
      onSuccess: () => invalidateAfter(queryClient, 'updateComment', scope),
    }),
    deleteComment: useMutation({
      mutationFn: (commentId: string) => dataSource.deleteComment({ params: { path: { commentId } } }),
      onSuccess: () => invalidateAfter(queryClient, 'deleteComment', scope),
    }),
  }
}

export type ThreadActions = ReturnType<typeof useThreadActions>
