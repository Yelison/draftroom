import { Tooltip, type BadgeTone } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { PersonAvatar, type PresenceStatus } from '../Avatar/PersonAvatar.tsx'
import styles from './Presence.module.css'

export interface PresenceEntry {
  userId: string
  name: string
  tone: BadgeTone
  status: PresenceStatus
}

export interface PresenceProps {
  people: readonly PresenceEntry[]
  /** How many avatars are drawn before the rest are counted; four by default. */
  limit?: number
}

/**
 * The people who are in the document, as avatars with the mark of their presence. Each avatar can be reached with the
 * keyboard so that the name shows as it does for the pointer; the rest beyond the limit are counted, not hidden.
 */
export function Presence({ people, limit = 4 }: PresenceProps) {
  const intl = useIntl()
  if (people.length === 0) return null
  const shown = people.slice(0, limit)
  const hidden = people.length - shown.length

  return (
    <ul className={styles.list} aria-label={intl.formatMessage({ id: 'presence.label' })}>
      {shown.map(({ userId, name, tone, status }) => (
        <li key={userId}>
          <Tooltip content={name} placement="bottom-end" describe={false}>
            {(trigger) => (
              // The name is already the accessible name of the avatar: focus is only what lets a keyboard see the tooltip.
              <span {...trigger} tabIndex={0} className={styles.person}>
                <PersonAvatar name={name} tone={tone} status={status} />
              </span>
            )}
          </Tooltip>
        </li>
      ))}
      {hidden > 0 && <li className={styles.more}>{intl.formatMessage({ id: 'presence.more' }, { count: hidden })}</li>}
    </ul>
  )
}
