import type { Schema } from '@draftroom/contract'
import type { UseQueryResult } from '@tanstack/react-query'
import { Button, Icon } from '@yelison/forma-ui'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'
import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import { SectionError } from './SectionError.tsx'
import { useGridColumns } from './useGridColumns.ts'
import styles from './Home.module.css'

/** How many rows of the grid the pinned documents take before the rest is folded behind a button. */
const foldedRows = 2

/**
 * The documents the person pinned, as chips with a star. At most two rows are drawn; with more, a button unfolds the rest
 * where they are and folds them again. A person with none has no section at all.
 */
export function PinnedDocuments({ pinned }: { pinned: UseQueryResult<Schema<'DocumentList'>> }) {
  const intl = useIntl()
  const listId = useId()
  const { grid, columns } = useGridColumns<HTMLUListElement>()
  const [unfolded, setUnfolded] = useState(false)
  const firstUnfolded = useRef<number | null>(null)
  const items = pinned.data?.items ?? []
  const folded = foldedRows * columns
  const shown = unfolded ? items : items.slice(0, folded)

  // The chips that were folded are in the page once the render is done: the first of them is where the keyboard goes on.
  useLayoutEffect(() => {
    if (firstUnfolded.current === null) return
    grid.current?.querySelectorAll('a')[firstUnfolded.current]?.focus()
    firstUnfolded.current = null
  })

  if (pinned.isSuccess && items.length === 0) return null

  return (
    <section aria-labelledby="home-pinned">
      <h2 id="home-pinned" className={styles.group}>
        {intl.formatMessage({ id: 'home.pinned.title' })}
      </h2>
      {pinned.isError ? (
        <SectionError title="home.pinned.error" retrying={pinned.isFetching} onRetry={() => void pinned.refetch()} />
      ) : pinned.isPending ? (
        <ListSkeleton rows={2} listClassName={`${styles.chips} ${styles.chipsSkeleton}`} label="home.pinned.loading" />
      ) : (
        <>
          <ul ref={grid} id={listId} className={styles.chips}>
            {shown.map((document) => (
              <li key={document.id}>
                <Link to={`/documents/${document.id}`} className={styles.chip}>
                  <Icon name="star" className={styles.chipStar} />
                  <span>{document.title}</span>
                </Link>
              </li>
            ))}
          </ul>
          {items.length > folded && (
            <Button
              variant="ghost"
              aria-expanded={unfolded}
              aria-controls={listId}
              onClick={() => {
                firstUnfolded.current = unfolded ? null : folded
                setUnfolded(!unfolded)
              }}
            >
              {unfolded
                ? intl.formatMessage({ id: 'home.pinned.showFewer' })
                : intl.formatMessage({ id: 'home.pinned.showAll' }, { count: items.length })}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
