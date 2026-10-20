import { useIntl } from 'react-intl'
import styles from './Members.module.css'

const rows = 6

/**
 * What the page shows while the members are on their way: the description, the invitation and the table with the
 * measures of the real ones, so nothing moves when they arrive. The description is the owner's and the count has
 * stand-in numbers; both are written invisibly, so the lines take the room their words take.
 */
export function MembersSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true" className={styles.skeleton}>
      <div className={styles.summary} aria-hidden="true">
        <p className={`${styles.description} ${styles.reserved}`}>
          {intl.formatMessage({ id: 'members.description' })}
        </p>
        {/* Whether the count shares the line with the description or goes under it depends on its width, not on its numbers. */}
        <p className={`${styles.count} ${styles.reserved}`}>
          {intl.formatMessage({ id: 'members.count' }, { members: 10, pending: 0 })}
        </p>
      </div>
      <div className={`${styles.invitePanel} ${styles.skeletonInvite}`} />
      <div className={styles.skeletonFilters} />
      <div className={styles.panel}>
        <div className={styles.skeletonHead} />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={styles.skeletonRow} />
        ))}
      </div>
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'members.loading' })}
      </p>
    </div>
  )
}
