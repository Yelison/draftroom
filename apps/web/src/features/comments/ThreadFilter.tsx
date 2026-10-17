import { FilterChip } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import styles from './ThreadFilter.module.css'

export type ThreadFilterValue = 'open' | 'resolved' | 'all'

export const threadFilters: readonly ThreadFilterValue[] = ['open', 'resolved', 'all']

/** Which threads the list shows. Each choice says how many threads it would show, so the person need not try it to know. */
export function ThreadFilter({
  value,
  counts,
  onChange,
}: {
  value: ThreadFilterValue
  counts: Record<ThreadFilterValue, number>
  onChange: (value: ThreadFilterValue) => void
}) {
  const intl = useIntl()

  return (
    <div role="group" aria-label={intl.formatMessage({ id: 'comments.filter.label' })} className={styles.filter}>
      {threadFilters.map((filter) => (
        <FilterChip key={filter} selected={filter === value} onClick={() => onChange(filter)}>
          {intl.formatMessage({ id: `comments.filter.${filter}` }, { count: counts[filter] })}
        </FilterChip>
      ))}
    </div>
  )
}
