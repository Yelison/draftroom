import { useEffect, useRef } from 'react'
import { focusMainContent } from '../../../app/mainContent.ts'

/**
 * "Pinned" and "No folder" leave the page when their last document does, and the heading that had the focus goes with
 * them: when fewer sections are drawn than a moment ago and the focus is on the page, it goes to the headline of the screen.
 */
export function useFocusWhenSectionsLeave(drawn: number) {
  const before = useRef<number | null>(null)

  useEffect(() => {
    if (before.current !== null && drawn < before.current && document.activeElement === document.body) {
      focusMainContent()
    }
    before.current = drawn
  }, [drawn])
}
