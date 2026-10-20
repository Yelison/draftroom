import { useIntl } from 'react-intl'
import styles from './Sharing.module.css'

const rows = 4

const block = (...extra: (string | undefined)[]) => [styles.skeletonBlock, ...extra].filter(Boolean).join(' ')

/**
 * What the dialog shows while who has access is on its way: the row that adds people and a list with the shape of the
 * real one (an avatar, two lines and a selector per row), so that nothing moves when the data arrives.
 */
export function ShareSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true" className={styles.content}>
      <div className={styles.section}>
        <span className={block(styles.skeletonHeading)} />
        <div className={styles.add}>
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className={styles.skeletonField}>
              <span className={block()} />
              <span className={block(styles.skeletonControl)} />
            </div>
          ))}
          <span className={block(styles.skeletonAction)} />
        </div>
      </div>
      <div className={styles.section}>
        <span className={block(styles.skeletonHeading)} />
        <div className={styles.principals}>
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className={styles.row}>
              <span className={block(styles.skeletonAvatar)} />
              <span className={styles.skeletonLines}>
                <span className={block()} />
                <span className={block()} />
              </span>
              <span className={block(styles.skeletonControl)} />
            </div>
          ))}
        </div>
      </div>
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'sharing.loading' })}
      </p>
    </div>
  )
}
