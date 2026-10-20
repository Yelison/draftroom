import type { Schema } from '@draftroom/contract'
import { Button } from '@yelison/forma-ui'
import { useMemo, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { StateMessage } from '../documents/StateMessage.tsx'
import { groupByDay } from './days.ts'
import { AutomaticToggle, TimelineFrame, TimelineSkeleton } from './TimelineFrame.tsx'
import { useFocusAfterLoadMore } from './useFocusAfterLoadMore.ts'
import { useDayLabel } from './useVersionName.ts'
import type { VersionsQuery } from './useVersions.ts'
import { VersionItem } from './VersionItem.tsx'
import styles from './VersionTimeline.module.css'

export interface VersionTimelineProps {
  query: VersionsQuery
  /** The versions to show, newest first: the list the screen keeps, without the automatic ones it hides. */
  versions: readonly Schema<'Version'>[]
  /** How many versions have arrived, hidden or not: with none shown, it tells "no versions" from "only automatic". */
  arrived: number
  selectedId: string | null
  showAutomatic: boolean
  onSelect: (version: Schema<'Version'>) => void
  onToggleAutomatic: () => void
}

/** The versions of a document by day: loading, none yet, only automatic ones, the list, and a failure to retry. */
export function VersionTimeline({
  query,
  versions,
  arrived,
  selectedId,
  showAutomatic,
  onSelect,
  onToggleAutomatic,
}: VersionTimelineProps) {
  const intl = useIntl()
  const dayLabel = useDayLabel()
  const { timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone } = intl
  // Taken once: the day a version is called "today" by does not change under a person who is reading.
  const [now] = useState(() => new Date())
  const days = useMemo(() => groupByDay(versions, timeZone, now), [versions, timeZone, now])
  const ids = useMemo(() => versions.map((version) => version.id), [versions])
  const panel = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const loadingMore = useFocusAfterLoadMore({
    panel,
    ids,
    loading: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    fallback: toggle,
  })

  const automaticToggle = (
    <AutomaticToggle ref={toggle} pressed={showAutomatic} disabled={query.isError} onToggle={onToggleAutomatic} />
  )

  if (query.isPending) return <TimelineSkeleton />
  if (query.isError) {
    return (
      <TimelineFrame toggle={automaticToggle}>
        <StateMessage
          role="alert"
          title={intl.formatMessage({ id: 'versions.error.title' })}
          description={intl.formatMessage({ id: 'versions.error.description' })}
        >
          <Button loading={query.isFetching} onClick={() => void query.refetch()}>
            {intl.formatMessage({ id: 'versions.error.retry' })}
          </Button>
        </StateMessage>
      </TimelineFrame>
    )
  }

  return (
    <TimelineFrame toggle={automaticToggle}>
      <div ref={panel}>
        {versions.length === 0 && !query.hasNextPage && (
          <StateMessage
            title={intl.formatMessage({ id: arrived === 0 ? 'versions.empty.title' : 'versions.onlyAutomatic.title' })}
            description={intl.formatMessage({
              id: arrived === 0 ? 'versions.empty.description' : 'versions.onlyAutomatic.description',
            })}
          />
        )}
        {days.map((day) => (
          <div key={day.key} className={styles.day}>
            <h3 className={styles.dayTitle}>{dayLabel(day)}</h3>
            <ul className={styles.list}>
              {day.versions.map((version) => (
                <VersionItem
                  key={version.id}
                  version={version}
                  selected={version.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </div>
        ))}
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
      </div>
    </TimelineFrame>
  )
}
