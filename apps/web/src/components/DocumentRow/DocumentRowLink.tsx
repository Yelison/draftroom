import { Link, type LinkProps } from 'react-router'
import styles from './DocumentRowLink.module.css'

/**
 * The name of a row, as the link that opens it. The link is the only stop of the Tab key the row adds for opening, and its
 * hit area is the whole row (the actions of the row sit above it), so there is no second link to the same page.
 */
export function DocumentRowLink({ className, ...props }: LinkProps) {
  return <Link {...props} className={[styles.link, className].filter(Boolean).join(' ')} />
}
