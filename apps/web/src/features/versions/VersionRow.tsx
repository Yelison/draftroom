import type { Schema } from '@draftroom/contract'
import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { kindMessageId } from './kinds.ts'
import { useVersionDate, useVersionName } from './useVersionName.ts'
import styles from './Versions.module.css'

export interface VersionRowProps {
  version: Schema<'Version'>
  selected: boolean
  onSelect: (version: Schema<'Version'>) => void
  /** Given only to owners: the server refuses anyone else, and a button that can only fail is not offered. */
  onRestore?: (version: Schema<'Version'>) => void
}

/** One version: what it is, who made it and when, to look at it, and for an owner the way to go back to it. */
export function VersionRow({ version, selected, onSelect, onRestore }: VersionRowProps) {
  const intl = useIntl()
  const nameOf = useVersionName()
  const dateOf = useVersionDate()
  const kind = intl.formatMessage({ id: kindMessageId[version.kind] })
  const date = dateOf(version)

  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.select}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(version)}
      >
        <span className={styles.name}>{version.label ?? kind}</span>
        {version.label !== null && <span className={styles.detail}>{kind}</span>}
        <span className={styles.detail}>
          {version.createdBy === null
            ? date
            : intl.formatMessage({ id: 'versions.row.byAuthor' }, { date, author: version.createdBy.name })}
        </span>
      </button>
      {onRestore !== undefined && (
        <Button
          size="compact"
          variant="secondary"
          aria-label={intl.formatMessage({ id: 'versions.row.restoreLabel' }, { name: nameOf(version) })}
          onClick={() => onRestore(version)}
        >
          {intl.formatMessage({ id: 'versions.row.restore' })}
        </Button>
      )}
    </li>
  )
}
