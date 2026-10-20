import { DocumentSectionsSkeleton } from '../documents/sections/SectionSkeleton.tsx'
import styles from './ExplorerSkeleton.module.css'

/** The explorer while it is on its way: the search and the actions, and the sections with the measures of the real ones. */
export function ExplorerSkeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.field} />
      <div className={styles.field} />
      <DocumentSectionsSkeleton compact />
    </div>
  )
}
