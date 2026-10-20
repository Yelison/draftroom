import { Outlet } from 'react-router'
import { NavRail } from '../../components/NavRail/NavRail.tsx'
import { MainContent } from './MainContent.tsx'
import styles from './OverviewLayout.module.css'

/** The layout of the screens that list things: a rail with the labels beside the icons, and the page. */
export function OverviewLayout() {
  return (
    <div className={styles.layout}>
      <NavRail variant="expanded" />
      <MainContent className={styles.main}>
        <Outlet />
      </MainContent>
    </div>
  )
}
