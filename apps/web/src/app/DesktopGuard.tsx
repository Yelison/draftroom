import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
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

  // The notice takes the focus when it appears, because the app it hides held it. When it goes away the focus returns
  // to the app. In StrictMode the first cleanup runs while the app is still hidden and does nothing; the second effect
  // takes the focus again and the real cleanup comes at the end.
  useEffect(() => {
    heading.current?.focus()
    return focusMainContent
  }, [])

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
