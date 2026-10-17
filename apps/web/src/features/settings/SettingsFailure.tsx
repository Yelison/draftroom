import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { StateMessage } from '../documents/StateMessage.tsx'

export interface SettingsFailureProps {
  onRetry: () => void
  retrying: boolean
}

/** What a tab says when it could not be read: the way forward is to try again. */
export function SettingsFailure({ onRetry, retrying }: SettingsFailureProps) {
  const intl = useIntl()

  return (
    <StateMessage
      role="alert"
      title={intl.formatMessage({ id: 'settings.error.title' })}
      description={intl.formatMessage({ id: 'settings.error.description' })}
    >
      <Button loading={retrying} onClick={onRetry}>
        {intl.formatMessage({ id: 'settings.error.retry' })}
      </Button>
    </StateMessage>
  )
}
