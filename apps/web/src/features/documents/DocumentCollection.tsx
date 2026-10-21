import type { Schema } from '@draftroom/contract'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useMemo, useRef, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { DocumentListRow } from './DocumentListRow.tsx'
import { DocumentsSkeleton } from './ListSkeleton.tsx'
import { QueryFailure } from './QueryFailure.tsx'
import { StateMessage } from './StateMessage.tsx'
import { documentListQuery } from './queries.ts'
import { useFocusFirstArrival } from './useFocusFirstArrival.ts'
import rows from './DocumentRows.module.css'

export interface DocumentCollectionProps {
  workspaceId: string
  /** Only the documents of this folder. */
  folderId?: string
  /** What the person searches for, already trimmed; `undefined` for no search. */
  term: string | undefined
  /** What to say when there is nothing to list and nobody is searching: the state, and the way to the first document. */
  empty: ReactNode
  /** Opens the dialog that renames or moves a document. */
  onActions: (document: Schema<'Document'>) => void
  /** Opens the dialog that archives one. A list that leaves it out does not offer archiving in its rows' menu. */
  onArchive?: (document: Schema<'Document'>) => void
  /** How the rows look: whole, or on a line for a narrow column. */
  compact?: boolean
  /** The document that is open, whose row is marked. */
  openDocumentId?: string
}

/**
 * The documents of a workspace or of a folder, a page at a time: loading, the list with "Load more", a search that found
 * nothing, and a failure that can be retried. While a search is typed the previous list stays until the new one is
 * there, so the page does not jump from list to skeleton on every key.
 */
export function DocumentCollection({
  workspaceId,
  folderId,
  term,
  empty,
  onActions,
  onArchive,
  compact = false,
  openDocumentId,
}: DocumentCollectionProps) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const query = useInfiniteQuery({
    ...documentListQuery(dataSource, workspaceId, {
      ...(folderId === undefined ? {} : { folderId }),
      ...(term === undefined ? {} : { query: term }),
    }),
    placeholderData: keepPreviousData,
  })
  const documents = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const ids = useMemo(() => documents.map((document) => document.id), [documents])
  const list = useRef<HTMLUListElement>(null)

  const loadingMore = useFocusFirstArrival(list, ids, 'a', JSON.stringify([workspaceId, folderId, term]))

  if (query.isPending) return <DocumentsSkeleton compact={compact} />
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
      <ul ref={list} className={`${rows.rows} ${rows.panel} ${compact ? rows.compact : ''}`}>
        {documents.map((document) => (
          <DocumentListRow
            key={document.id}
            document={document}
            onRenameOrMove={onActions}
            {...(onArchive === undefined ? {} : { onArchive })}
            compact={compact}
            {...(openDocumentId === undefined ? {} : { openDocumentId })}
          />
        ))}
      </ul>
      {query.hasNextPage && (
        <Button
          className={rows.more}
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
