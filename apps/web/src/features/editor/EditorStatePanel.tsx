import type { ReactNode } from 'react'
import styles from './EditorStatePanel.module.css'

/** What a screen says when there is no document to show: a sentence and the way forward, centred in the work area. */
export function EditorStatePanel({ description, children }: { description: string; children: ReactNode }) {
  return (
    <div className={styles.panel}>
      <p className={styles.description}>{description}</p>
      {children}
    </div>
  )
}
