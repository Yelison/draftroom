import { useIntl } from 'react-intl'
import styles from './Timeline.module.css'

/** How many rows the skeleton has: enough to fill the first screen, as the first events will. */
const skeletonRows = 6

/** What the timeline shows while it is on its way: a week, a day and rows with the measures of the real ones, so nothing moves when it arrives. */
export function TimelineSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true" className={styles.timeline}>
      <div className={styles.week}>
        <div className={styles.weekTitleSkeleton} />
        <div className={styles.day}>
          <div className={styles.dayTitleSkeleton} />
          <ul className={styles.list}>
            {Array.from({ length: skeletonRows }, (_, index) => (
              <li key={index} className={styles.item}>
                <span className={styles.timeSkeleton} />
                <span className={styles.bodySkeleton} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'history.loading' })}
      </p>
    </div>
  )
}
