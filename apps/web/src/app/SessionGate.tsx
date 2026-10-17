import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet, useLocation } from 'react-router'
import { isApiError } from '../data/errors.ts'
import { useDataSource } from '../data/useDataSource.ts'
import { redirectState } from '../features/auth/redirect.ts'
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
  const me = useQuery({ ...meQuery(useDataSource()), retry: retryTransportOnce })

  if (isApiError(me.error, 'unauthenticated')) {
    return <Navigate to="/sign-in" replace state={redirectState(location)} />
  }
  return <Outlet />
}
