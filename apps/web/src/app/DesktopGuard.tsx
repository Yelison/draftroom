import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import styles from './DesktopGuard.module.css'
import { focusMainContent } from './mainContent.ts'

/** The narrowest window the product is built for. The CSS has no equivalent of this number to share. */
export const desktopMinWidth = 1280

// A strict "less than", so a window of 1279.5 px (a browser zoom can produce one) is narrow and 1280 is not.
const narrowQuery = `(width < ${desktopMinWidth}px)`

// `matchMedia` tells the app when the window crosses the width, not at every pixel it is dragged through, which is
// what a `resize` listener that stores the width would do.
function subscribe(onChange: () => void) {
  const query = window.matchMedia(narrowQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const isNarrow = () => window.matchMedia(narrowQuery).matches

/**
 * Shows the requirement of a desktop window instead of the app when the window is narrower than `desktopMinWidth`.
 * The app stays mounted and only hidden, so crossing the width and coming back loses nothing: an open document keeps
 * its session and the person keeps their place.
 */
export function DesktopGuard({ children }: { children: ReactNode }) {
  const narrow = useSyncExternalStore(subscribe, isNarrow)

  return (
    <>
      {narrow && <DesktopNotice />}
      <div hidden={narrow}>{children}</div>
    </>
  )
}

function DesktopNotice() {
  const intl = useIntl()
  const heading = useRef<HTMLHeadingElement>(null)

  const previous = useRef<Element | null>(null)

  // The notice takes the focus when it appears, because the app it hides held it, and gives it back to the element
  // that had it when it goes away, so the place where the person was typing is not lost. The element is read in a
  // layout effect: by the time a passive one runs, the browser has already dropped the focus of what was hidden. It is
  // given back in the cleanup of a passive effect, which runs once the app is on screen again; a layout cleanup runs
  // while it is still hidden. If the element is gone, the focus goes to the page's heading. StrictMode runs the layout
  // effect twice, so the first element read is kept.
  useLayoutEffect(() => {
    previous.current ??= document.activeElement
    heading.current?.focus()
  }, [])
  useEffect(
    () => () => {
      const element = previous.current
      if (element instanceof HTMLElement && element !== document.body && element.isConnected) element.focus()
      else focusMainContent()
    },
    [],
  )

  return (
    <main className={styles.notice}>
      <h1 ref={heading} tabIndex={-1} className={styles.title}>
        {intl.formatMessage({ id: 'desktopGuard.title' })}
      </h1>
      <p className={styles.description}>
        {intl.formatMessage({ id: 'desktopGuard.description' }, { width: desktopMinWidth })}
      </p>
    </main>
  )
}
