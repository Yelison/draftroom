import { Outlet } from 'react-router'
import { DesktopGuard } from './DesktopGuard.tsx'
import { SavedPreferences } from './SavedPreferences.tsx'
import { SkipLink } from './SkipLink.tsx'
import { useFocusOnNavigation } from './useFocusOnNavigation.ts'

/**
 * What every page shares, whatever its layout: the skip link, the notice of a narrow window, the focus on navigating and
 * the preferences saved on the account.
 */
export function AppFrame() {
  useFocusOnNavigation()

  return (
    <>
      {/* The first stop of the keyboard, ahead of the notice of the desktop guard. */}
      <SkipLink />
      <DesktopGuard>
        <SavedPreferences />
        <Outlet />
      </DesktopGuard>
    </>
  )
}
