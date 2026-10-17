import { useEffect, useRef } from 'react'
import { useLocation, useMatches } from 'react-router'
import { focusMainContent } from './mainContent.ts'

/**
 * Where the dialog on screen sits: the path of the page it is over, or `undefined` when the route is a page.
 * A route says it is a dialog in its `handle`; its parent is the match before it.
 */
function pageUnderDialog(matches: ReturnType<typeof useMatches>): string | undefined {
  const leaf = matches.at(-1)
  const isDialog =
    typeof leaf?.handle === 'object' && leaf.handle !== null && 'dialog' in leaf.handle && leaf.handle.dialog
  return isDialog ? matches.at(-2)?.pathname : undefined
}

/**
 * Moves the focus to the heading of the new page when the path changes. Not on the first load, where the skip link has
 * to be the first thing a keyboard reaches, not when only the search or the hash change, which filter the page the
 * person is already on, and not when a dialog opens over its page or closes back to it: the page is still there, and the
 * dialog takes the focus and gives it back to what opened it. The path is remembered instead of a "first render" flag
 * because StrictMode runs effects twice.
 */
export function useFocusOnNavigation() {
  const { pathname } = useLocation()
  const underDialog = pageUnderDialog(useMatches())
  const previous = useRef({ pathname, underDialog })

  useEffect(() => {
    const { pathname: from, underDialog: wasUnderDialog } = previous.current
    previous.current = { pathname, underDialog }
    if (pathname === from) return
    const opened = underDialog === from
    const closed = wasUnderDialog === pathname
    if (opened || closed) return
    focusMainContent()
  }, [pathname, underDialog])
}
