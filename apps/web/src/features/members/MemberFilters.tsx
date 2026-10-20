import { FilterChip } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { memberFilters, type MemberFilter } from './memberFilters.ts'
import styles from './Members.module.css'

export interface MemberFiltersProps {
  value: MemberFilter
  onChange: (filter: MemberFilter) => void
}

/** A single choice among the filters, as toggle buttons in a named group: the chosen one is the one that is pressed. */
export function MemberFilters({ value, onChange }: MemberFiltersProps) {
  const intl = useIntl()

  return (
    <div role="group" aria-label={intl.formatMessage({ id: 'members.filter.label' })} className={styles.filters}>
      {memberFilters.map((filter) => (
        <FilterChip key={filter} selected={filter === value} onClick={() => onChange(filter)}>
          {intl.formatMessage({ id: `members.filter.${filter}` })}
        </FilterChip>
      ))}
    </div>
  )
}
