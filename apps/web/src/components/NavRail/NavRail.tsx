import type { ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'
import { useActiveSection } from '../../app/sections.ts'
import { navItems } from './navItems.tsx'
import { RailPerson } from './RailPerson.tsx'
import { RailWorkspace } from './RailWorkspace.tsx'
import styles from './NavRail.module.css'

export interface NavRailProps {
  /**
   * `expanded` puts the label beside the icon in a desktop window; `compact` puts it under it, which is what the editor
   * always does and what every rail does in a window narrower than a desktop.
   */
  variant: 'expanded' | 'compact'
  /** What closes the rail, at its foot and last in its Tab order: it is part of the navigation, not of the page. */
  footer?: ReactNode
}

/**
 * The navigation of the product: the workspace on top, the items, and at the foot the person and what ends their session.
 * Exactly one item is current: the one of the section of the page. Every item is a stop of the Tab key, and the current
 * one is told apart by its background, which is not the focus ring. The foot sits inside the same landmark, so the order
 * of the focus follows what is seen: the rail from top to bottom, then the page.
 */
export function NavRail({ variant, footer }: NavRailProps) {
  const intl = useIntl()
  const activeSection = useActiveSection()

  return (
    <nav
      aria-label={intl.formatMessage({ id: 'nav.label' })}
      // Compact is the base of the stylesheet: only the expanded rail has a class of its own.
      className={variant === 'expanded' ? `${styles.rail} ${styles.expanded}` : styles.rail}
    >
      <RailWorkspace />
      <ul className={styles.items}>
        {navItems.map(({ section, to, labelId, icon }) => (
          <li key={section}>
            <Link to={to} className={styles.item} aria-current={section === activeSection ? 'page' : undefined}>
              {icon}
              <span className={styles.label}>{intl.formatMessage({ id: labelId })}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.account}>
        <RailPerson />
        {footer}
      </div>
    </nav>
  )
}
