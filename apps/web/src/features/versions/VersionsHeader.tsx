import type { ReactNode } from 'react'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import styles from './Versions.module.css'

/**
 * The headline of the history, with the title of the document under it and the actions at the other end. The title line
 * is there, empty, before the document arrives, so the header does not grow when it does.
 */
export function VersionsHeader({
  documentTitle,
  children,
}: {
  documentTitle?: string | undefined
  children?: ReactNode
}) {
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        <PageTitle titleId="screen.versions" />
        <p className={styles.documentTitle}>{documentTitle}</p>
      </div>
      <div className={styles.actions}>{children}</div>
    </header>
  )
}
