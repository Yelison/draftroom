import { useIntl } from 'react-intl'
import { StateMessage } from './StateMessage.tsx'

/** What a screen says to a person who belongs to no workspace: not a failure, so there is nothing to retry. */
export function NoWorkspace() {
  const intl = useIntl()

  return (
    <StateMessage
      title={intl.formatMessage({ id: 'documents.noWorkspace.title' })}
      description={intl.formatMessage({ id: 'documents.noWorkspace.description' })}
    />
  )
}
