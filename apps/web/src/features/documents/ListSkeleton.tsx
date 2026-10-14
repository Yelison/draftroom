import { useIntl } from 'react-intl'
import styles from './ListSkeleton.module.css'

const cards = 6

/** What a list shows while it is on its way: cards with the measures of the real ones, so nothing moves when it arrives. */
export function ListSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true">
      <ul className={styles.grid}>
        {Array.from({ length: cards }, (_, index) => (
          <li key={index} className={styles.card} />
        ))}
      </ul>
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'documents.loading' })}
      </p>
    </div>
  )
}
