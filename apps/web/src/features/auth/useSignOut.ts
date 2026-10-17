import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { isApiError } from '../../data/errors.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { forgetAccount } from './lastAccount.ts'
import { useLeaveAccount } from './useLeaveAccount.tsx'

export interface SigningOut {
  signOut(userId: string): void
  pending: boolean
  /** Why the session could not be ended, if it could not; the person is still signed in. */
  failure: Error | null
  dialogs: ReactNode
}

/**
 * Signing out: clear what this browser kept of the account, end the session on the server, and only then leave. The order
 * matters: once the session is gone nothing can be asked of the server, and a failure in the middle must leave the person
 * signed in (and able to try again), not on a page whose data they can no longer reach. A session that has already ended
 * is what signing out wanted, so it counts as done.
 */
export function useSignOut(): SigningOut {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { leave, dialogs } = useLeaveAccount('sign-out')

  const mutation = useMutation({
    mutationFn: async (userId: string): Promise<'out' | 'stayed'> => {
      if ((await leave(userId)) === 'stayed') return 'stayed'
      try {
        await dataSource.signOut()
      } catch (error) {
        if (!isApiError(error, 'unauthenticated')) throw error
      }
      return 'out'
    },
    onSuccess: async (result) => {
      if (result === 'stayed') return
      forgetAccount()
      // Out of the pages first, and only then the data: a page that is still on screen would ask for it again, and be told
      // that nobody is signed in.
      await navigate('/sign-in', { replace: true })
      // What was read for the account is not for whoever signs in next.
      queryClient.clear()
    },
  })

  return { signOut: mutation.mutate, pending: mutation.isPending, failure: mutation.error, dialogs }
}
