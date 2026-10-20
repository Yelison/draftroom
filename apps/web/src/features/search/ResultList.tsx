import type { Schema } from '@draftroom/contract'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useMemo, useRef } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { DocumentListRow, type DocumentTextRenderer } from '../documents/DocumentListRow.tsx'
import { DocumentsSkeleton } from '../documents/ListSkeleton.tsx'
import { QueryFailure } from '../documents/QueryFailure.tsx'
import { documentListQuery } from '../documents/queries.ts'
import { useFocusFirstArrival } from '../documents/useFocusFirstArrival.ts'
import rows from '../documents/DocumentRows.module.css'
import { Highlighted } from './Highlighted.tsx'
import { NoResults } from './NoResults.tsx'
import styles from './ResultList.module.css'

/** How much of an excerpt may come before the first match: enough to read it, little enough that the match is on the line. */
const excerptLead = 20

export interface ResultListProps {
  workspaceId: string
  /** What is searched, already trimmed. */
  term: string
  onActions: (document: Schema<'Document'>) => void
  onArchive: (document: Schema<'Document'>) => void
}

/**
 * The documents that match `term`, a page at a time, each with what matched marked: the count above them, the list with
 * "Load more", nothing found, and a failure that can be tried again, whether it is the first page or a later one. The
 * list of another search is never shown under this one's marks, so a new search goes through the skeleton.
 */
export function ResultList({ workspaceId, term, onActions, onArchive }: ResultListProps) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const query = useInfiniteQuery(documentListQuery(dataSource, workspaceId, { query: term }))
  const documents = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const ids = useMemo(() => documents.map((document) => document.id), [documents])
  const list = useRef<HTMLUListElement>(null)
  // Both "Load more" and "Try again" go away when what they ask for arrives, and take the focus with them.
  const keepFocus = useFocusFirstArrival(list, ids, 'a', JSON.stringify([workspaceId, term]))

  const renderText: DocumentTextRenderer = (text, field) => (
    <Highlighted text={text} term={term} {...(field === 'excerpt' ? { lead: excerptLead } : {})} />
  )

  // The count line is on the page in every state, with the height of a line, so what arrives under it moves nothing.
  const count =
    query.data !== undefined
      ? intl.formatMessage(
          { id: query.hasNextPage ? 'documents.results.more' : 'documents.results.announcement' },
          { count: documents.length },
        )
      : ''
  const countLine = (
    <p role="status" className={styles.count}>
      {count}
    </p>
  )

  if (query.isPending) return <ResultsLoading />
  if (query.data === undefined) {
    return (
      <>
        {countLine}
        <QueryFailure
          onRetry={() => {
            keepFocus()
            void query.refetch()
          }}
          retrying={query.isFetching}
        />
      </>
    )
  }
  if (documents.length === 0) {
    return (
      <>
        {countLine}
        <NoResults term={term} />
      </>
    )
  }

  return (
    <>
      {countLine}
      <ul ref={list} className={`${rows.rows} ${rows.panel}`}>
        {documents.map((document) => (
          <DocumentListRow
            key={document.id}
            document={document}
            onRenameOrMove={onActions}
            onArchive={onArchive}
            renderText={renderText}
          />
        ))}
      </ul>
      {query.hasNextPage && (
        <>
          {query.isFetchNextPageError && !query.isFetchingNextPage && (
            <p role="alert" className={styles.moreFailed}>
              {intl.formatMessage({ id: 'search.loadMore.error' })}
            </p>
          )}
          <Button
            className={rows.more}
            variant="secondary"
            loading={query.isFetchingNextPage}
            onClick={() => {
              keepFocus()
              void query.fetchNextPage()
            }}
          >
            {intl.formatMessage({ id: query.isFetchNextPageError ? 'documents.error.retry' : 'documents.loadMore' })}
          </Button>
        </>
      )}
    </>
  )
}

/** What the results are while they are on their way: the count line and the skeleton of the list, which keep its places. */
export function ResultsLoading() {
  return (
    <>
      <p className={styles.count} />
      <DocumentsSkeleton />
    </>
  )
}
