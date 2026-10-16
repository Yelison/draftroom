import { SearchField } from '@yelison/forma-ui'
import type { KeyboardEventHandler, ReactNode } from 'react'
import { useIntl } from 'react-intl'
import styles from './ListToolbar.module.css'

export interface ListToolbarProps {
  search: string
  onSearch: (search: string) => void
  /** Reacts to the keys of the search field: Enter, on the screens where it opens the results. */
  onSearchKeyDown?: KeyboardEventHandler<HTMLInputElement>
  /** The actions beside the search: new folder, new document. */
  children: ReactNode
}

/** The search of a list screen and its actions, in one row. */
export function ListToolbar({ search, onSearch, onSearchKeyDown, children }: ListToolbarProps) {
  const intl = useIntl()

  return (
    <div className={styles.toolbar}>
      <div className={styles.search}>
        <SearchField
          label={intl.formatMessage({ id: 'documents.search.label' })}
          placeholder={intl.formatMessage({ id: 'documents.search.label' })}
          value={search}
          onValueChange={onSearch}
          {...(onSearchKeyDown === undefined ? {} : { onKeyDown: onSearchKeyDown })}
        />
      </div>
      <div className={styles.actions}>{children}</div>
    </div>
  )
}
