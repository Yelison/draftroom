import { useId } from 'react'
import { SectionFailure, type SectionFailureProps } from './SectionFailure.tsx'
import styles from './Sections.module.css'

/**
 * A section whose list could not be read at all ("Pinned", the folders): its heading, so the person knows what failed,
 * with the failure under it. The heading has nothing to fold, so it is not a button.
 */
export function FailedSection({ name, ...failure }: SectionFailureProps) {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <h2 id={headingId} className={`${styles.title} ${styles.failedTitle}`}>
        {name}
      </h2>
      <div className={styles.body}>
        <SectionFailure name={name} {...failure} />
      </div>
    </section>
  )
}
