import { Outlet } from 'react-router'
import { MainContent } from './MainContent.tsx'
import styles from './AuthLayout.module.css'

/** The layout of the screens a person sees before they are signed in: no navigation, and the whole window for the screen. */
export function AuthLayout() {
  return (
    <MainContent className={styles.main}>
      <Outlet />
    </MainContent>
  )
}
