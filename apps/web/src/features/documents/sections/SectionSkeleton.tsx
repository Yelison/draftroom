import { useIntl } from 'react-intl'
import rows from '../DocumentRows.module.css'
import styles from './Sections.module.css'

/** Rows with the measures of the real ones, for the section whose documents are on their way. */
export function SectionSkeletonRows({ compact = false }: { compact?: boolean }) {
  return (
    <ul aria-busy="true" className={compact ? `${rows.rows} ${rows.compact}` : rows.rows}>
      {[0, 1, 2].map((row) => (
        <li key={row} className={rows.skeletonRow} />
      ))}
    </ul>
  )
}

/**
 * What the screen shows until the folders, the pinned documents and the documents with no folder are in: two sections,
 * with the measures of the real ones, so the page does not move when it arrives.
 */
export function DocumentSectionsSkeleton({ compact = false }: { compact?: boolean }) {
  const intl = useIntl()

  return (
    <div aria-busy="true" className={compact ? `${styles.sections} ${styles.compactSections}` : styles.sections}>
      {[0, 1].map((section) => (
        <div key={section} className={styles.section}>
          <div className={styles.head}>
            <div className={styles.toggle} />
          </div>
          <div className={styles.body}>
            <ul className={compact ? `${rows.rows} ${rows.compact}` : rows.rows}>
              {[0, 1, 2].map((row) => (
                <li key={row} className={rows.skeletonRow} />
              ))}
            </ul>
          </div>
        </div>
      ))}
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'documents.loading' })}
      </p>
    </div>
  )
}
