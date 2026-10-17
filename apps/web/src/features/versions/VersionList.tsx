import type { Schema } from '@draftroom/contract'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useMemo, useRef } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import { StateMessage } from '../documents/StateMessage.tsx'
import { useFocusFirstArrival } from '../documents/useFocusFirstArrival.ts'
import { versionsQuery } from './queries.ts'
import { VersionRow } from './VersionRow.tsx'
import styles from './Versions.module.css'

export interface VersionListProps {
  documentId: string
  selectedId: string | null
  onSelect: (version: Schema<'Version'>) => void
  onRestore?: (version: Schema<'Version'>) => void
}

/** The versions of a document, newest first and a page at a time: loading, none yet, the list, and a failure to retry. */
export function VersionList({ documentId, selectedId, onSelect, onRestore }: VersionListProps) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const query = useInfiniteQuery(versionsQuery(dataSource, documentId))
  const versions = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const ids = useMemo(() => versions.map((version) => version.id), [versions])
  const list = useRef<HTMLUListElement>(null)
  const loadingMore = useFocusFirstArrival(list, ids, 'button', documentId)

  if (query.isPending) return <ListSkeleton rows={5} listClassName={styles.list} label="versions.loading" />
  if (query.isError) {
    return (
      <StateMessage
        role="alert"
        title={intl.formatMessage({ id: 'versions.error.title' })}
        description={intl.formatMessage({ id: 'versions.error.description' })}
      >
        <Button loading={query.isFetching} onClick={() => void query.refetch()}>
          {intl.formatMessage({ id: 'versions.error.retry' })}
        </Button>
      </StateMessage>
    )
  }
  if (versions.length === 0) {
    return (
      <StateMessage
        title={intl.formatMessage({ id: 'versions.empty.title' })}
        description={intl.formatMessage({ id: 'versions.empty.description' })}
      />
    )
  }

  return (
    <>
      <ul ref={list} className={styles.list}>
        {versions.map((version) => (
          <VersionRow
            key={version.id}
            version={version}
            selected={version.id === selectedId}
            onSelect={onSelect}
            onRestore={onRestore}
          />
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
          {intl.formatMessage({ id: 'versions.loadMore' })}
        </Button>
      )}
    </>
  )
}
