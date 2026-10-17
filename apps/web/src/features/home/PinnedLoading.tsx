import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import layout from '../documents/ListLayout.module.css'
import { PinnedSection } from './PinnedSection.tsx'
import styles from './Home.module.css'

/** What the pinned documents show while they are on its way: cards of the height the real ones have, so nothing moves. */
export function PinnedLoading() {
  return (
    <PinnedSection>
      <ListSkeleton rows={3} listClassName={`${layout.grid} ${styles.skeleton}`} label="home.pinned.loading" />
    </PinnedSection>
  )
}
