import type { Schema } from '@draftroom/contract'
import { Icon } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { ActorAvatar } from '../history/ActorAvatar.tsx'
import { kindMessageId } from './kinds.ts'
import { useVersionSize } from './useVersionSize.ts'
import { useVersionTime } from './useVersionName.ts'
import styles from './VersionTimeline.module.css'

export interface VersionItemProps {
  version: Schema<'Version'>
  selected: boolean
  onSelect: (version: Schema<'Version'>) => void
}

/** One version: what it is, who made it and when, and how big. Choosing it opens it in the reader. */
export function VersionItem({ version, selected, onSelect }: VersionItemProps) {
  const intl = useIntl()
  const timeOf = useVersionTime()
  const sizeOf = useVersionSize()
  const kind = intl.formatMessage({ id: kindMessageId[version.kind] })
  const time = timeOf(version)
  // A restore copies the name of the version it went back to: the kind is what tells it from that one.
  const showsKind = version.label !== null && version.kind !== 'manual'

  return (
    <li>
      <button
        type="button"
        data-version-id={version.id}
        className={version.kind === 'auto' ? `${styles.item} ${styles.automatic}` : styles.item}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(version)}
      >
        {version.createdBy === null ? (
          // Nobody made it: a person's initials would read as one, so the server's own versions get a clock.
          <span className={styles.clock}>
            <Icon name="clock" size={16} />
          </span>
        ) : (
          <ActorAvatar actor={version.createdBy} />
        )}
        <span className={styles.text}>
          <span className={styles.name}>{version.label ?? kind}</span>
          {showsKind && <span className={styles.detail}>{kind}</span>}
          <span className={styles.detail}>
            {version.createdBy === null
              ? time
              : intl.formatMessage({ id: 'versions.item.byAuthor' }, { time, author: version.createdBy.name })}
          </span>
        </span>
        <span className={styles.size}>{sizeOf(version.sizeBytes)}</span>
      </button>
    </li>
  )
}
