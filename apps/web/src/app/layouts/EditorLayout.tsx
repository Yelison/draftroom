import { Outlet } from 'react-router'
import { Explorer } from '../../features/explorer/Explorer.tsx'
import { NavRail } from '../../components/NavRail/NavRail.tsx'
import { AccountControl } from '../../features/auth/AccountControl.tsx'
import { MainContent } from './MainContent.tsx'
import styles from './EditorLayout.module.css'

/** The layout of a document: a compact rail, the explorer column and the work area, which takes the rest of the width. */
export function EditorLayout() {
  return (
    <div className={styles.layout}>
      <NavRail variant="compact" />
      <div className={styles.explorer}>
        <Explorer />
      </div>
      <MainContent className={styles.main}>
        <Outlet />
      </MainContent>
      <div className={styles.account}>
        <AccountControl variant="compact" />
      </div>
    </div>
  )
}
