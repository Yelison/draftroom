import { Button } from '@yelison/forma-ui'
import { useMemo, useRef, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { DocumentListRow, type DocumentListRowProps } from '../DocumentListRow.tsx'
import { useFocusFirstArrival } from '../useFocusFirstArrival.ts'
import rows from '../DocumentRows.module.css'
import { toggleIdOf } from './SectionFrame.tsx'
import { SectionFailure } from './SectionFailure.tsx'
import { SectionSkeletonRows } from './SectionSkeleton.tsx'
import { useFocusAfterRemoval } from './useFocusAfterRemoval.ts'
import type { useSectionDocuments } from './useSectionDocuments.ts'
import styles from './Sections.module.css'

export interface SectionRowsProps extends Pick<DocumentListRowProps, 'onRenameOrMove' | 'onArchive'> {
  sectionKey: string
  /** The name of the section, for the buttons that act on all of it. */
  name: string
  data: ReturnType<typeof useSectionDocuments>
  /** What to say when the folder has no documents at all. */
  empty: ReactNode
}

/** The rows of a section, a page at a time: on their way, failed, listed, and the line that says there is nothing. */
export function SectionRows({ sectionKey, name, data, empty, ...actions }: SectionRowsProps) {
  const intl = useIntl()
  const { query, documents, firstPageEmpty } = data
  const list = useRef<HTMLUListElement>(null)
  // Stable between renders: the hooks below follow the rows by the identity of this list.
  const ids = useMemo(() => documents.map((document) => document.id), [documents])
  const onFocus = useFocusAfterRemoval(list, ids, () => document.getElementById(toggleIdOf(sectionKey)))
  const loadingMore = useFocusFirstArrival(list, ids, 'a', sectionKey)

  // Pages that hold only pinned documents are asked for one after the other: until there is a row, or no more pages, the
  // section is on its way, and "Show more" over no rows would be a lie.
  const searching = documents.length === 0 && query.hasNextPage && !query.isFetchNextPageError
  if (query.isPending || searching) return <SectionSkeletonRows />
  // A failed "Show more" or a failed refresh leaves the rows that are there, and says so beside them.
  if (query.isError && query.data === undefined)
    return <SectionFailure name={name} onRetry={() => void query.refetch()} retrying={query.isFetching} />
  if (firstPageEmpty) return <p className={styles.line}>{empty}</p>
  if (documents.length === 0 && !query.hasNextPage) {
    return <p className={styles.line}>{intl.formatMessage({ id: 'documents.section.allPinned' })}</p>
  }

  return (
    <>
      <ul ref={list} className={rows.rows} onFocus={onFocus}>
        {documents.map((document) => (
          <DocumentListRow key={document.id} document={document} {...actions} />
        ))}
      </ul>
      {query.hasNextPage && (
        <div className={styles.footer}>
          <Button
            variant="secondary"
            aria-label={intl.formatMessage({ id: 'documents.section.showMoreIn' }, { name })}
            loading={query.isFetchingNextPage}
            onClick={() => {
              loadingMore()
              void query.fetchNextPage()
            }}
          >
            {intl.formatMessage({ id: 'documents.section.showMore' })}
          </Button>
          {query.isFetchNextPageError && (
            <p role="alert" className={`${styles.line} ${styles.problem}`}>
              {intl.formatMessage({ id: 'documents.section.showMore.error' })}
            </p>
          )}
        </div>
      )}
    </>
  )
}
