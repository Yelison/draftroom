import { Icon, type IconName } from '@yelison/forma-ui'
import type { ReactNode } from 'react'
import styles from './Sections.module.css'

/** Where the focus goes when a section loses the row that had it: the button that folds it. */
export const toggleIdOf = (key: string) => `section-${key}-toggle`
const bodyIdOf = (key: string) => `section-${key}-body`

export interface SectionFrameProps {
  /** What names the section in the fold state and in the ids of its parts: `pinned`, `unfiled` or the id of a folder. */
  sectionKey: string
  title: string
  icon: IconName
  expanded: boolean
  onToggle: () => void
  /** Beside the title, outside the button that folds: the menu of a folder. */
  actions?: ReactNode
  /** The heading is the height of a compact button, for the narrow column of the explorer. */
  compact?: boolean
  children: ReactNode
}

/**
 * A section of the Documents screen: a heading whose button folds what is under it. The body is in the page when it is
 * folded (empty and hidden), so `aria-controls` always names an element.
 */
export function SectionFrame({
  sectionKey,
  title,
  icon,
  expanded,
  onToggle,
  actions,
  compact = false,
  children,
}: SectionFrameProps) {
  const headingId = `section-${sectionKey}-heading`

  return (
    <section
      aria-labelledby={headingId}
      className={compact ? `${styles.section} ${styles.compactSection}` : styles.section}
    >
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          <button
            id={toggleIdOf(sectionKey)}
            type="button"
            className={styles.toggle}
            aria-expanded={expanded}
            aria-controls={bodyIdOf(sectionKey)}
            onClick={onToggle}
          >
            <Icon name="chevron" className={`${styles.chevron} ${expanded ? '' : styles.collapsed}`} />
            <Icon name={icon} className={styles.sectionIcon} />
            <span className={styles.sectionName}>{title}</span>
          </button>
        </h2>
        {actions}
      </div>
      <div id={bodyIdOf(sectionKey)} hidden={!expanded} className={styles.body}>
        {expanded && children}
      </div>
    </section>
  )
}
