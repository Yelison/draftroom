import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { StateMessage } from '../documents/StateMessage.tsx'

export interface MembersFailureProps {
  onRetry: () => void
  retrying: boolean
}

/** What the page says when the members could not be read: the way forward is to try again. */
export function MembersFailure({ onRetry, retrying }: MembersFailureProps) {
  const intl = useIntl()

  return (
    <StateMessage
      role="alert"
      title={intl.formatMessage({ id: 'members.error.title' })}
      description={intl.formatMessage({ id: 'members.error.description' })}
    >
      <Button loading={retrying} onClick={onRetry}>
        {intl.formatMessage({ id: 'members.error.retry' })}
      </Button>
    </StateMessage>
  )
}
