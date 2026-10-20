import { Outlet } from 'react-router'
import { MainContent } from '../../app/layouts/MainContent.tsx'
import { NavRail } from '../../components/NavRail/NavRail.tsx'
import { AccountControl } from '../auth/AccountControl.tsx'
import styles from './VersionsLayout.module.css'

/**
 * The layout of the history of a document: the compact rail and the work area, which takes the rest of the width. The
 * explorer of the editor's layout is left out: this page has one task, and the list of versions is the column that
 * matters. It is a layout of its own, and not the editor's without a column, so the editor's stays as it was.
 */
export function VersionsLayout() {
  return (
    <div className={styles.layout}>
      <NavRail variant="compact" footer={<AccountControl variant="compact" />} />
      <MainContent className={styles.main}>
        <Outlet />
      </MainContent>
    </div>
  )
}
