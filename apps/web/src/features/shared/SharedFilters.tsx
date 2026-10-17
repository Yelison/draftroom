import { FilterChip } from '@yelison/forma-ui'
import type { Ref } from 'react'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import { sharedAccesses, type SharedAccess } from './accessFilter.ts'
import styles from './Shared.module.css'

const labels: Record<SharedAccess | 'all', MessageId> = {
  all: 'shared.filter.all',
  edit: 'shared.filter.edit',
  comment: 'shared.filter.comment',
  view: 'shared.filter.view',
}

export interface SharedFiltersProps {
  access: SharedAccess | undefined
  onChange: (access: SharedAccess | undefined) => void
  /** The chip of "All", for the focus to land on when the filter is cleared from somewhere else. */
  allChip?: Ref<HTMLButtonElement>
}

/** The permission the list is narrowed to, one at a time: toggle buttons in a named group, the applied one pressed. */
export function SharedFilters({ access, onChange, allChip }: SharedFiltersProps) {
  const intl = useIntl()

  return (
    <div role="group" aria-label={intl.formatMessage({ id: 'shared.filters.label' })} className={styles.filters}>
      <FilterChip ref={allChip} selected={access === undefined} onClick={() => onChange(undefined)}>
        {intl.formatMessage({ id: labels.all })}
      </FilterChip>
      {sharedAccesses.map((value) => (
        <FilterChip key={value} selected={access === value} onClick={() => onChange(value)}>
          {intl.formatMessage({ id: labels[value] })}
        </FilterChip>
      ))}
    </div>
  )
}
