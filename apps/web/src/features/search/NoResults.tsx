import { useIntl } from 'react-intl'
import { StateMessage } from '../documents/StateMessage.tsx'

/** What the search says when nothing matches: what was searched, and the ways to look further that there are. */
export function NoResults({ term }: { term: string }) {
  const intl = useIntl()

  return (
    <StateMessage
      title={intl.formatMessage({ id: 'documents.noResults.title' }, { query: term })}
      description={intl.formatMessage({ id: 'search.noResults.description' })}
    />
  )
}
