import type { ReactNode } from 'react'
import { mainContentId } from '../mainContent.ts'
import styles from './MainContent.module.css'

/** The work area of a layout. It can take the focus (the skip link goes to it) but is not a stop of the Tab key. */
export function MainContent({ className, children }: { className: string | undefined; children: ReactNode }) {
  return (
    <main id={mainContentId} tabIndex={-1} className={`${styles.main} ${className}`}>
      {children}
    </main>
  )
}
