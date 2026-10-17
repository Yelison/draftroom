import type { Schema } from '@draftroom/contract'
import { useIntl } from 'react-intl'
import { succeeded, type Outcome } from '../../components/CommentCard/outcome.ts'
import type { CommentCardActions } from '../../components/CommentCard/CommentCard.tsx'
import { problemMessageId } from '../documents/problemMessage.ts'
import type { ThreadActions } from './useThreadActions.ts'

/** What the panel says after an action worked: the message of the live region. */
export type Announcement = 'created' | 'replied' | 'resolved' | 'reopened' | 'edited' | 'deleted'

/**
 * The actions of a card over the mutations of the panel. A request that fails is not thrown at the card: it is told in the
 * person's language (the server's own text is never shown) and the card keeps what the person wrote.
 */
export function useCardActions(
  mutations: ThreadActions,
  { onDone, onBefore }: { onDone: (announcement: Announcement) => void; onBefore: (thread: Schema<'Thread'>) => void },
) {
  const intl = useIntl()

  async function attempt(request: () => Promise<unknown>, announcement: Announcement): Promise<Outcome> {
    try {
      await request()
    } catch (error) {
      return { ok: false, message: intl.formatMessage({ id: problemMessageId(error) }) }
    }
    onDone(announcement)
    return succeeded
  }

  return (thread: Schema<'Thread'>): CommentCardActions => ({
    reply: (body) => attempt(() => mutations.replyToThread.mutateAsync({ threadId: thread.id, body }), 'replied'),
    resolve: () => {
      onBefore(thread)
      return attempt(() => mutations.resolveThread.mutateAsync(thread.id), 'resolved')
    },
    reopen: () => {
      onBefore(thread)
      return attempt(() => mutations.reopenThread.mutateAsync(thread.id), 'reopened')
    },
    edit: (commentId, body) => attempt(() => mutations.updateComment.mutateAsync({ commentId, body }), 'edited'),
    remove: (commentId) => {
      onBefore(thread)
      return attempt(() => mutations.deleteComment.mutateAsync(commentId), 'deleted')
    },
  })
}
