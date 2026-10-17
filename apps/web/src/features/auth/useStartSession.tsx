import { useQueryClient } from '@tanstack/react-query'
import type { Schema } from '@draftroom/contract'
import { useCallback, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { accountsBeingLeft, markAccountsBeingLeft, rememberAccount, rememberedAccount } from './lastAccount.ts'
import { destinationAfterSignIn } from './redirect.ts'
import { useLeaveAccount } from './useLeaveAccount.tsx'

export interface StartingSession {
  /** What happens once the server has started a session: the person is somebody now, and goes where they were going. */
  start(user: Schema<'User'>): Promise<void>
  /** The dialogs of leaving the account that was there before, if it was another. */
  dialogs: ReactNode
}

/**
 * What a sign-in or a sign-up does with the session the server has just started. If this browser last signed in as
 * somebody else, that account is left (its copies are cleared, with the questions that has: protocol §12.2). What was
 * read for the account before is dropped, since it is not for this one, and the person goes where they were going.
 */
export function useStartSession(): StartingSession {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { leave, dialogs } = useLeaveAccount('switch')

  const start = useCallback(
    async (user: Schema<'User'>) => {
      // Whoever is left by this sign-in: the account the browser held, and any whose question a tab never answered. The new
      // person is not left, whatever was written about them.
      const toLeave = [...new Set([...accountsBeingLeft(), rememberedAccount()])].filter(
        (userId): userId is string => userId !== null && userId !== user.id,
      )
      // The session of the browser is the new person's from the moment the server answered, in every tab. The other tabs hear
      // of it through the account that is written down, so it is written **now** and not when the person has answered the
      // question below, which can wait for ever: a tab that is not told keeps believing it is the old account, and what it
      // asks next is answered as somebody else and taken for the loss of a document of the old one. What this tab read is
      // dropped with it. What is being left is written down apart, so that a question that is never answered is asked again.
      markAccountsBeingLeft(toLeave)
      rememberAccount(user.id)
      queryClient.clear()
      for (const [index, userId] of toLeave.entries()) {
        await leave(userId)
        markAccountsBeingLeft(toLeave.slice(index + 1))
      }
      void navigate(destinationAfterSignIn(location.state), { replace: true })
    },
    [leave, location.state, navigate, queryClient],
  )

  return { start, dialogs }
}
