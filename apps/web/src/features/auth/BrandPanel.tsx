import { Icon, type IconName } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import styles from './BrandPanel.module.css'

interface Point {
  icon: IconName
  titleId: MessageId
  bodyId: MessageId
}

/** What the product does today, and only that: writing together, comments on a passage, and the versions that are kept. */
const points: Point[] = [
  { icon: 'team', titleId: 'auth.brand.together.title', bodyId: 'auth.brand.together.body' },
  { icon: 'comment', titleId: 'auth.brand.comment.title', bodyId: 'auth.brand.comment.body' },
  { icon: 'clock', titleId: 'auth.brand.versions.title', bodyId: 'auth.brand.versions.body' },
]

/**
 * Says what Draftroom is to somebody who has not signed in. Its words are read: they are what the person is told about
 * the product. The mark and the icons are not, since the name and each point say the same in words. In a narrow window
 * the panel is the name and the line above the form, and the points, which only repeat what the line promises, go.
 */
export function BrandPanel() {
  const intl = useIntl()

  return (
    <div className={styles.panel}>
      <span className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          D
        </span>
        <span className={styles.name}>Draftroom</span>
      </span>
      <div className={styles.body}>
        <p className={styles.tagline}>{intl.formatMessage({ id: 'auth.brand.tagline' })}</p>
        <ul className={styles.points}>
          {points.map(({ icon, titleId, bodyId }) => (
            <li key={icon} className={styles.point}>
              <span className={styles.pointIcon}>
                <Icon name={icon} size={22} />
              </span>
              <span className={styles.pointText}>
                <strong>{intl.formatMessage({ id: titleId })}</strong>
                <span>{intl.formatMessage({ id: bodyId })}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
