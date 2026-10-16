import { useQuery } from '@tanstack/react-query'
import { Button, FilterChip, Menu, type MenuItem } from '@yelison/forma-ui'
import { useRef } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import type { MessageId } from '../../i18n/messages.ts'
import { ranges, type HistoryRange } from './historyFilters.ts'
import { documentOptionsQuery, peopleOptionsQuery } from './queries.ts'
import type { HistoryFilterState } from './useHistoryFilters.ts'
import styles from './HistoryFilters.module.css'

interface Choice {
  id: string
  label: string
}

/** One filter that opens its options: the chip says what is chosen, and the menu has the way to take the choice off. */
function ChoiceFilter({
  kind,
  choices,
  extraItems = [],
  pending = false,
  chosen,
  onChoose,
  searchable,
}: {
  kind: 'document' | 'person' | 'range'
  choices: readonly Choice[]
  /** What the menu says after the options when they are not all there: on their way, or not read. */
  extraItems?: readonly MenuItem[]
  /** The options are still on their way. */
  pending?: boolean
  chosen: string | undefined
  onChoose: (id: string | undefined) => void
  searchable: boolean
}) {
  const intl = useIntl()
  const label = choices.find(({ id }) => id === chosen)?.label
  // Chosen but not among the options: the options are on their way, or the thing is gone. Say so, never leave the chip bare.
  const value =
    chosen === undefined
      ? undefined
      : (label ??
        intl.formatMessage({ id: extraItems.length > 0 ? 'history.filters.loading' : 'history.filters.unavailable' }))
  const items: MenuItem[] = [
    {
      id: 'any',
      label: intl.formatMessage({ id: `history.filters.${kind}.any` }),
      checked: chosen === undefined,
      onSelect: () => onChoose(undefined),
    },
    ...choices.map(({ id, label: text }) => ({
      id,
      label: text,
      title: text,
      searchable,
      checked: id === chosen,
      onSelect: () => onChoose(id),
    })),
    ...extraItems,
  ]

  return (
    <Menu
      label={intl.formatMessage({ id: `history.filters.${kind}.menu` })}
      placement="bottom-start"
      items={items}
      {...(kind === 'range'
        ? {}
        : {
            search: {
              label: intl.formatMessage({ id: `history.filters.${kind}.search` }),
              emptyText: intl.formatMessage({ id: `history.filters.${kind}.empty` }),
            },
          })}
    >
      {(trigger) => (
        <FilterChip {...trigger} selected={value !== undefined}>
          {value === undefined
            ? intl.formatMessage({ id: `history.filters.${kind}` })
            : intl.formatMessage({ id: `history.filters.${kind}Value` }, { value })}
        </FilterChip>
      )}
    </Menu>
  )
}

const rangeLabel: Record<HistoryRange, MessageId> = {
  today: 'history.filters.range.today',
  week: 'history.filters.range.week',
  month: 'history.filters.range.month',
}

export interface HistoryFiltersProps {
  workspaceId: string
  state: HistoryFilterState
}

/**
 * The filters of the history, one chip each that opens its options, and the way to take them all off. The documents and
 * the people to choose from are read here, not by the screen: the chips are on the page from the first paint and the
 * options arrive when they arrive.
 */
export function HistoryFilters({ workspaceId, state }: HistoryFiltersProps) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const group = useRef<HTMLDivElement>(null)
  const documents = useQuery(documentOptionsQuery(dataSource, workspaceId))
  const people = useQuery(peopleOptionsQuery(dataSource, workspaceId))
  const { filters, set } = state

  /** What a list of options still has to say once it is not there to choose from. */
  const pendingOrFailed = (query: { isPending: boolean; isError: boolean; refetch: () => unknown }): MenuItem[] => {
    if (query.isPending) {
      return [
        {
          id: 'loading',
          label: intl.formatMessage({ id: 'history.filters.loading' }),
          disabled: true,
          onSelect: () => undefined,
        },
      ]
    }
    if (query.isError) {
      return [
        {
          id: 'retry',
          label: intl.formatMessage({ id: 'history.filters.failed' }),
          onSelect: () => void query.refetch(),
        },
      ]
    }
    return []
  }

  const clear = () => {
    state.clear()
    // The button goes with the filters: the focus stays among them, on the first chip.
    group.current?.querySelector('button')?.focus()
  }

  return (
    <div
      ref={group}
      role="group"
      aria-label={intl.formatMessage({ id: 'history.filters.label' })}
      className={styles.filters}
    >
      <ChoiceFilter
        kind="document"
        searchable
        choices={(documents.data?.items ?? []).map(({ id, title }) => ({ id, label: title }))}
        extraItems={pendingOrFailed(documents)}
        pending={documents.isPending}
        chosen={filters.documentId}
        onChoose={(id) => set('documentId', id)}
      />
      <ChoiceFilter
        kind="person"
        searchable
        // Whoever has not signed up cannot have done anything, so there is nothing of theirs to filter by.
        choices={(people.data?.items ?? []).flatMap((member) =>
          member.status === 'active' && member.name !== null ? [{ id: member.userId, label: member.name }] : [],
        )}
        extraItems={pendingOrFailed(people)}
        pending={people.isPending}
        chosen={filters.actorId}
        onChoose={(id) => set('actorId', id)}
      />
      <ChoiceFilter
        kind="range"
        searchable={false}
        choices={ranges.map((range) => ({ id: range, label: intl.formatMessage({ id: rangeLabel[range] }) }))}
        chosen={filters.range}
        onChoose={(id) =>
          set(
            'range',
            ranges.find((range) => range === id),
          )
        }
      />
      {state.applied > 0 && (
        <Button variant="ghost" size="compact" onClick={clear}>
          {intl.formatMessage({ id: 'history.filters.clear' })}
        </Button>
      )}
    </div>
  )
}
