import { Outlet } from 'react-router'
import { DesktopGuard } from './DesktopGuard.tsx'
import { SavedPreferences } from './SavedPreferences.tsx'
import { SkipLink } from './SkipLink.tsx'
import { useFocusOnNavigation } from './useFocusOnNavigation.ts'

/**
 * What every page shares, whatever its layout: the desktop requirement, the skip link, the focus on navigating and the
 * preferences saved on the account.
 */
export function AppFrame() {
  useFocusOnNavigation()

  return (
    <DesktopGuard>
      <SavedPreferences />
      <SkipLink />
      <Outlet />
    </DesktopGuard>
  )
}
