import { Alert, Button } from '@yelison/forma-ui'
import { useState, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import styles from './DesktopGuard.module.css'
import { focusMainContent } from './mainContent.ts'
import { desktopMinWidth, useNarrowWindow } from './narrowWindow.ts'

/** Where this tab remembers that the notice was closed: it stays closed until the tab does. */
const dismissedKey = 'draftroom.desktopNoticeDismissed'

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(dismissedKey) === 'true'
  } catch {
    return false
  }
}

function rememberDismissed(): void {
  try {
    sessionStorage.setItem(dismissedKey, 'true')
  } catch {
    // Storage blocked: the notice stays closed for as long as the page does.
  }
}

/**
 * Tells the person that the window is narrower than `desktopMinWidth`, and leaves the app where it is. A browser zoom of
 * 200 % on a 1280 px window is a 640 px window, which WCAG 1.4.10 asks the content to survive: the layouts reflow below
 * this width (their own CSS), so covering the app with a screen that says "make it larger" would take away what the
 * reflow keeps. The notice is not modal and never takes the focus, so someone who zooms in while they type goes on
 * typing; it can be closed, and stays closed for the tab.
 */
export function DesktopGuard({ children }: { children: ReactNode }) {
  const narrow = useNarrowWindow()
  const [dismissed, setDismissed] = useState(readDismissed)

  return (
    <>
      {narrow && !dismissed && (
        <DesktopNotice
          onDismiss={() => {
            rememberDismissed()
            setDismissed(true)
            // The button that had the focus is gone with the notice.
            focusMainContent()
          }}
        />
      )}
      {children}
    </>
  )
}

function DesktopNotice({ onDismiss }: { onDismiss: () => void }) {
  const intl = useIntl()

  return (
    <Alert className={styles.notice} title={intl.formatMessage({ id: 'desktopGuard.title' })}>
      <p className={styles.description}>
        {intl.formatMessage({ id: 'desktopGuard.description' }, { width: desktopMinWidth })}
      </p>
      <Button variant="secondary" size="compact" onClick={onDismiss}>
        {intl.formatMessage({ id: 'desktopGuard.dismiss' })}
      </Button>
    </Alert>
  )
}
