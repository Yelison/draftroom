import { ReaderPlaceholder } from './VersionReader.tsx'
import { TimelineSkeleton } from './TimelineFrame.tsx'
import { VersionsHeader } from './VersionsHeader.tsx'
import styles from './Versions.module.css'

/** The body of the screen while the document is on its way: the list and the reader, with their measures. */
export function VersionsPlaceholder() {
  return (
    <div className={styles.body}>
      <TimelineSkeleton />
      <ReaderPlaceholder />
    </div>
  )
}

/** What the route shows while the screen's own code is on its way. */
export function VersionsSkeleton() {
  return (
    <div className={styles.screen}>
      <VersionsHeader />
      <VersionsPlaceholder />
    </div>
  )
}
