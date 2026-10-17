import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { isApiError } from '../data/errors.ts'
import { queryKeys } from '../data/queryKeys.ts'
import { useDataSource } from '../data/useDataSource.ts'
import { redirectState } from '../features/auth/redirect.ts'
import { useIdentityChanges } from '../features/auth/useIdentityChanges.ts'
import { retryTransportOnce } from '../features/documents/queries.ts'
import { meQuery } from '../features/editor/meQuery.ts'

/**
 * The door of every page that needs a signed-in person: once the server says that nobody is, the person is sent to sign in,
 * with the page they were going to kept for afterwards. It asks who the session is, and does not hold the page back while
 * it waits: the page draws as it always has, and is replaced as soon as the answer is that there is no session. That is a
 * convenience of the interface and not a barrier, which is the server's (every request is refused without a session). A
 * session that ends while the app is open is caught by the query client (`AppProviders`), which asks again.
 */
export function SessionGate() {
  const location = useLocation()
  const queryClient = useQueryClient()
  const me = useQuery({ ...meQuery(useDataSource()), retry: retryTransportOnce })
  // When the account may have changed under this tab, the page is taken down first, and then what it read is dropped and the
  // server is asked who is signed in: nothing is asked with an identity that is not known, and a page that was open is made
  // again for whoever it is now. Dropping the data while the page is still there would have its queries ask for it again at
  // once. `heldAt` is when, and the answer to `getMe` that comes after it is what lets the page go.
  const [heldAt, setHeldAt] = useState<number | null>(null)
  const accountChanged = useCallback(() => setHeldAt(Date.now()), [])
  // The connection is the first to know that the session ended, and the page stays as it is (the editor says what happened):
  // who is signed in is asked first, so that what the page asks next is not answered as somebody else and taken for the loss
  // of the document.
  const sessionEnded = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: queryKeys.me() }),
    [queryClient],
  )
  useIdentityChanges({ accountChanged, sessionEnded })
  useEffect(() => {
    // Resets, not removes: the question of this gate is the only active query, and the reset asks it again.
    if (heldAt !== null) void queryClient.resetQueries()
  }, [heldAt, queryClient])

  if (isApiError(me.error, 'unauthenticated')) {
    return <Navigate to="/sign-in" replace state={redirectState(location)} />
  }
  if (heldAt !== null && me.dataUpdatedAt < heldAt) return null
  return <Outlet />
}
