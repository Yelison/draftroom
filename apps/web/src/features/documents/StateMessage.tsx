import type { ReactNode } from 'react'
import styles from './StateMessage.module.css'

export interface StateMessageProps {
  /** Omitted where the headline of the screen already says it. */
  title?: string
  description?: string
  /** `alert` for a failure the person did not cause, so a screen reader says it when it appears. */
  role?: 'alert'
  children?: ReactNode
}

/** What a list says when there is nothing to list: what happened, and the way forward. */
export function StateMessage({ title, description, role, children }: StateMessageProps) {
  return (
    <div className={styles.message} role={role}>
      {title !== undefined && <p className={styles.title}>{title}</p>}
      {description !== undefined && <p className={styles.description}>{description}</p>}
      {children}
    </div>
  )
}
