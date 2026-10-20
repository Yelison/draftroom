import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { StateMessage } from './StateMessage.tsx'
import { useSessionEnding } from './useSessionEnding.ts'

export interface QueryFailureProps {
  onRetry: () => void
  retrying: boolean
}

/** What a list says when it could not be read: the way forward is to try again. */
export function QueryFailure({ onRetry, retrying }: QueryFailureProps) {
  const intl = useIntl()
  if (useSessionEnding()) return null

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
