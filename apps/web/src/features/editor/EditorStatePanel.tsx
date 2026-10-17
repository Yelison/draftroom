import type { ReactNode } from 'react'
import styles from './EditorStatePanel.module.css'

/** What a screen says when there is no document to show: a sentence and the way forward, centred in the work area. */
export function EditorStatePanel({
  title,
  description,
  children,
}: {
  /** What happened, when the screen's own heading is not already saying it. */
  title?: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className={styles.panel}>
      {title !== undefined && <h2 className={styles.title}>{title}</h2>}
      {description !== undefined && <p className={styles.description}>{description}</p>}
      {children}
    </div>
  )
}
