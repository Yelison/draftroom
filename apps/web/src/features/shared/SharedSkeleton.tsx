import { useIntl } from 'react-intl'
import styles from './Shared.module.css'

/** Two blocks of three rows, with the measures of the real ones, so the headings and the rows do not move when the list arrives. */
export function SharedSkeleton() {
  const intl = useIntl()

  return (
    <div aria-busy="true" className={styles.sections}>
      {[0, 1].map((block) => (
        <div key={block} className={styles.section}>
          <div className={styles.sectionHead} />
          <ul className={styles.rows}>
            {[0, 1, 2].map((row) => (
              <li key={row} className={styles.row} />
            ))}
          </ul>
        </div>
      ))}
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'shared.loading' })}
      </p>
    </div>
  )
}
