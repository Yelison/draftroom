import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { focusMainContent } from './mainContent.ts'

/**
 * Moves the focus to the heading of the new page when the path changes. Not on the first load, where the skip link has
 * to be the first thing a keyboard reaches, and not when only the search or the hash change, which filter the page the
 * person is already on. The path is remembered instead of a "first render" flag because StrictMode runs effects twice.
 */
export function useFocusOnNavigation() {
  const { pathname } = useLocation()
  const focusedPath = useRef(pathname)

  useEffect(() => {
    if (pathname === focusedPath.current) return
    focusedPath.current = pathname
    focusMainContent()
  }, [pathname])
}
