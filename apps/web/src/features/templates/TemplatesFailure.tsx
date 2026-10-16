import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { StateMessage } from '../documents/StateMessage.tsx'

export interface TemplatesFailureProps {
  onRetry: () => void
  retrying: boolean
}

/** What the templates say when they could not be read: announced when it appears, with the way to try again. */
export function TemplatesFailure({ onRetry, retrying }: TemplatesFailureProps) {
  const intl = useIntl()

  return (
    <StateMessage
      role="alert"
      title={intl.formatMessage({ id: 'templates.error.title' })}
      description={intl.formatMessage({ id: 'documents.error.description' })}
    >
      <Button loading={retrying} onClick={onRetry}>
        {intl.formatMessage({ id: 'documents.error.retry' })}
      </Button>
    </StateMessage>
  )
}
