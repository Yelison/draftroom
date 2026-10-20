import { useIntl } from 'react-intl'
import { useSearchParams } from 'react-router'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import layout from '../documents/ListLayout.module.css'
import { StateMessage } from '../documents/StateMessage.tsx'
import { searchTerm } from '../documents/searchTerm.ts'
import { SearchForm } from './SearchForm.tsx'
import { SearchResults } from './SearchResults.tsx'

/**
 * The screen of `/search?q=`: the documents that match what the URL searches for, a page at a time, with the matches
 * marked. The URL is the search, so it can be shared and Back and Forward walk through the searches. A URL with nothing
 * to search for invites to search and asks the server for nothing.
 *
 * The headline is the same in every state, so the focus that navigation puts on it stays on it when the results arrive.
 */
export function SearchScreen() {
  const intl = useIntl()
  const [params] = useSearchParams()
  const term = searchTerm(params.get('q') ?? '')

  return (
    <div className={layout.screen}>
      <PageTitle title={intl.formatMessage({ id: 'screen.search' })} />
      <SearchForm term={term} />
      {term === undefined ? (
        <StateMessage
          title={intl.formatMessage({ id: 'search.prompt.title' })}
          description={intl.formatMessage({ id: 'search.prompt.description' })}
        />
      ) : (
        <SearchResults term={term} />
      )}
    </div>
  )
}
