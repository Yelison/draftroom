import { useEffect } from 'react'
import { onSessionEnded } from '../../collab/sessionEnded.ts'
import { lastAccountKey } from './lastAccount.ts'

/**
 * Calls back when this tab finds out that who the browser is has changed without it: another tab signed in as somebody else
 * or out (the account the browser holds is written to the storage they share, which every other tab is told of), or the
 * server closed the connection of the open document because the session ended. A session belongs to the browser, so it is
 * the same one in every tab, and what a tab has read was read for the account it had.
 */
export function useIdentityChanges(onChange: () => void): void {
  useEffect(() => {
    const fromAnotherTab = (event: StorageEvent) => {
      // `null` is the storage being cleared altogether.
      if (event.key === lastAccountKey || event.key === null) onChange()
    }
    window.addEventListener('storage', fromAnotherTab)
    const stopListening = onSessionEnded(onChange)
    return () => {
      window.removeEventListener('storage', fromAnotherTab)
      stopListening()
    }
  }, [onChange])
}
