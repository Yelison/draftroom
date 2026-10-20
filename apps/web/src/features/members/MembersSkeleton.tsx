import { useIntl } from 'react-intl'
import styles from './Members.module.css'

const rows = 6

/**
 * What the page shows while the members are on their way: the description, the invitation and the table with the
 * measures of the real ones, so nothing moves when they arrive. The description is the owner's, written invisibly: the
 * line takes the room its words take.
 */
export function MembersSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true" className={styles.skeleton}>
      <p aria-hidden="true" className={`${styles.description} ${styles.reserved}`}>
        {intl.formatMessage({ id: 'members.description' })}
      </p>
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
