import type { Schema } from '@draftroom/contract'
import {
  CommentCard,
  type CommentCardActions,
  type CommentCardState,
} from '../../../components/CommentCard/CommentCard.tsx'
import { canComment, canDeleteComment, canEditComment } from '../roles.ts'
import { CompactThread } from './CompactThread.tsx'

export interface MarginThreadProps {
  thread: Schema<'Thread'>
  state: CommentCardState
  /** Whether it is the thread the person is on, which is the whole card. */
  active: boolean
  role: Schema<'DocumentRole'>
  personId: string
  actions: CommentCardActions
  onActivate: () => void
  onShowInText: () => void
}

/** A thread of the margin: the whole card for the one the person is on, and the compact one, which chooses it, for the rest. */
export function MarginThread({
  thread,
  state,
  active,
  role,
  personId,
  actions,
  onActivate,
  onShowInText,
}: MarginThreadProps) {
  if (!active) return <CompactThread thread={thread} state={state} onActivate={onActivate} />
  return (
    <CommentCard
      thread={thread}
      state={state}
      active
      mayComment={canComment(role)}
      mayEdit={(comment) => canEditComment(role, comment, personId)}
      mayDelete={(comment) => canDeleteComment(role, comment, personId)}
      actions={actions}
      {...(state === 'open' ? { onShowInText } : {})}
    />
  )
}
