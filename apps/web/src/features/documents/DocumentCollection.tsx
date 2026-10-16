import type { Schema } from '@draftroom/contract'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useRef, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { DocumentCard } from './DocumentCard.tsx'
import { DocumentsSkeleton } from './ListSkeleton.tsx'
import { QueryFailure } from './QueryFailure.tsx'
import { StateMessage } from './StateMessage.tsx'
import { documentListQuery } from './queries.ts'
import { useFocusFirstArrival } from './useFocusFirstArrival.ts'
import layout from './ListLayout.module.css'

export interface DocumentCollectionProps {
  workspaceId: string
  /** Only the documents of this folder. */
  folderId?: string
  /** What the person searches for, already trimmed; `undefined` for no search. */
  term: string | undefined
  /** What to say when there is nothing to list and nobody is searching: the state, and the way to the first document. */
  empty: ReactNode
  onActions: (document: Schema<'Document'>) => void
}

/**
 * The documents of a workspace or of a folder, a page at a time: loading, the list with "Load more", a search that found
 * nothing, and a failure that can be retried. While a search is typed the previous list stays until the new one is
 * there, so the page does not jump from list to skeleton on every key.
 */
export function DocumentCollection({ workspaceId, folderId, term, empty, onActions }: DocumentCollectionProps) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const query = useInfiniteQuery({
    ...documentListQuery(dataSource, workspaceId, {
      ...(folderId === undefined ? {} : { folderId }),
      ...(term === undefined ? {} : { query: term }),
    }),
    placeholderData: keepPreviousData,
  })
  const documents = query.data?.pages.flatMap((page) => page.items) ?? []
  const list = useRef<HTMLUListElement>(null)

  const loadingMore = useFocusFirstArrival(list, documents.length, 'a')

  if (query.isPending) return <DocumentsSkeleton />
  if (query.isError) return <QueryFailure onRetry={() => void query.refetch()} retrying={query.isFetching} />

  if (documents.length === 0) {
    return term === undefined ? (
      empty
    ) : (
      <StateMessage
        title={intl.formatMessage({ id: 'documents.noResults.title' }, { query: term })}
        description={intl.formatMessage({ id: 'documents.noResults.description' })}
      />
    )
  }

  return (
    <>
      <ul ref={list} className={layout.grid}>
        {documents.map((document) => (
          <li key={document.id}>
            <DocumentCard document={document} onActions={onActions} />
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <Button
          variant="secondary"
          loading={query.isFetchingNextPage}
          onClick={() => {
            loadingMore()
            void query.fetchNextPage()
          }}
        >
          {intl.formatMessage({ id: 'documents.loadMore' })}
        </Button>
      )}
      {term !== undefined && (
        <p role="status" className="forma-visually-hidden">
          {intl.formatMessage(
            { id: query.hasNextPage ? 'documents.results.more' : 'documents.results.announcement' },
            { count: documents.length },
          )}
        </p>
      )}
    </>
  )
}
