import { Outlet } from 'react-router'
import { DesktopGuard } from './DesktopGuard.tsx'
import { SkipLink } from './SkipLink.tsx'
import { useFocusOnNavigation } from './useFocusOnNavigation.ts'

/** What every page shares, whatever its layout: the desktop requirement, the skip link and the focus on navigating. */
export function AppFrame() {
  useFocusOnNavigation()

  return (
    <DesktopGuard>
      <SkipLink />
      <Outlet />
    </DesktopGuard>
  )
}
