import { useIntl } from 'react-intl'
import styles from './ListSkeleton.module.css'

export interface ListSkeletonProps {
  /** How many cards stand in for the list. */
  count?: number
  /** Whether a screen reader is told it is loading; one message is enough where several lists load together. */
  announce?: boolean
}

/** What a list shows while it is on its way: cards with the measures of the real ones, so nothing moves when it arrives. */
export function ListSkeleton({ count = 6, announce = true }: ListSkeletonProps) {
  const intl = useIntl()

  return (
    <div aria-busy="true">
      <ul className={styles.grid}>
        {Array.from({ length: count }, (_, index) => (
          <li key={index} className={styles.card} />
        ))}
      </ul>
      {announce && (
        <p role="status" className="forma-visually-hidden">
          {intl.formatMessage({ id: 'documents.loading' })}
        </p>
      )}
    </div>
  )
}
