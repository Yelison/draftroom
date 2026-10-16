import { Avatar, type AvatarSize, type BadgeTone } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import styles from './PersonAvatar.module.css'

/** Whether someone is in the document now, stepped away from it, or not in it (the three states of Presence). */
export type PresenceStatus = 'online' | 'away' | 'offline'

export interface PersonAvatarProps {
  name: string
  tone: BadgeTone
  status: PresenceStatus
  size?: AvatarSize
}

/**
 * A person's avatar with the mark of their presence. The mark is a shape and a colour, and the name and the status are
 * said once, in the accessible name of the whole: the avatar of Forma UI inside is decoration.
 */
export function PersonAvatar({ name, tone, status, size = 'small' }: PersonAvatarProps) {
  const intl = useIntl()

  return (
    <span
      role="img"
      aria-label={intl.formatMessage({ id: 'presence.person' }, { name, status })}
      className={styles.person}
    >
      <Avatar name={name} tone={tone} size={size} decorative />
      <span className={styles.mark} data-status={status} aria-hidden="true" />
    </span>
  )
}
