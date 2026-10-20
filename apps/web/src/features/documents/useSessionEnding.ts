import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { isApiError } from '../../data/errors.ts'
import { queryKeys } from '../../data/queryKeys.ts'

/**
 * Whether the session is over, or being checked. It fails every list at once, and the app asks who is signed in and sends
 * the person to sign in: saying (and announcing, it is an alert) that the connection failed would be false, so a failure
 * draws nothing while that is being found out.
 */
export function useSessionEnding() {
  const askingWhoIsSignedIn = useIsFetching({ queryKey: queryKeys.me() }) > 0
  const sessionEnded = isApiError(useQueryClient().getQueryState(queryKeys.me())?.error, 'unauthenticated')
  return askingWhoIsSignedIn || sessionEnded
}
