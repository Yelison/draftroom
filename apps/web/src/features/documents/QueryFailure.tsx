import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { isApiError } from '../../data/errors.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { StateMessage } from './StateMessage.tsx'

export interface QueryFailureProps {
  onRetry: () => void
  retrying: boolean
}

/** What a list says when it could not be read: the way forward is to try again. */
export function QueryFailure({ onRetry, retrying }: QueryFailureProps) {
  const intl = useIntl()
  // A session that has ended fails every list at once, and the app asks who is signed in and sends the person to sign in:
  // saying (and announcing, it is an alert) that the connection failed would be false. Nothing is drawn while that is being found out.
  const askingWhoIsSignedIn = useIsFetching({ queryKey: queryKeys.me() }) > 0
  const sessionEnded = isApiError(useQueryClient().getQueryState(queryKeys.me())?.error, 'unauthenticated')
  if (askingWhoIsSignedIn || sessionEnded) return null

  return (
    <StateMessage
      role="alert"
      title={intl.formatMessage({ id: 'documents.error.title' })}
      description={intl.formatMessage({ id: 'documents.error.description' })}
    >
      <Button loading={retrying} onClick={onRetry}>
        {intl.formatMessage({ id: 'documents.error.retry' })}
      </Button>
    </StateMessage>
  )
}
