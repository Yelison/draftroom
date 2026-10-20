import { useEffect, useRef } from 'react'
import { useLocation, useMatches } from 'react-router'
import { focusMainContent } from './mainContent.ts'

/** Reads a flag of the route's `handle`, which is declared by the route table and so is not typed by the router. */
function flagOf(handle: unknown, name: 'dialog'): boolean {
  return (
    typeof handle === 'object' &&
    handle !== null &&
    Object.entries(handle).some(([key, value]) => key === name && value === true)
  )
}

/**
 * Where the dialog on screen sits: the path of the page it is over, or `undefined` when the route is a page.
 * A route says it is a dialog in its `handle`; its parent is the match before it.
 */
function pageUnderDialog(matches: ReturnType<typeof useMatches>): string | undefined {
  return flagOf(matches.at(-1)?.handle, 'dialog') ? matches.at(-2)?.pathname : undefined
}

/**
 * Moves the focus to the heading of the new page when the path changes. Not on the first load, where the skip link has
 * to be the first thing a keyboard reaches, not when only the search or the hash change, which filter the page the
 * person is already on (which is also how Settings opens and closes: `?settings=`), and not when a dialog route opens over
 * its page or closes back to it: the page is still there, and the dialog takes the focus and gives it back to what
 * opened it. The path is remembered instead of a "first render" flag
 * because StrictMode runs effects twice.
 */
export function useFocusOnNavigation() {
  const { pathname } = useLocation()
  const matches = useMatches()
  const underDialog = pageUnderDialog(matches)
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
