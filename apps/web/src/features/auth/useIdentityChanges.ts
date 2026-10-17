import { useEffect } from 'react'
import { onSessionEnded } from '../../collab/sessionEnded.ts'
import { lastAccountKey } from './lastAccount.ts'

/**
 * What this tab does when it finds out that who the browser is has changed without it. A session belongs to the browser, so
 * it is the same one in every tab, and what a tab has read was read for the account it had.
 */
export interface IdentityChanges {
  /** Another tab signed in as somebody else or out: the account the browser holds is written to the storage the tabs share. */
  accountChanged(): void
  /** The server closed the connection of the open document because the session ended (`4401`): the first to know. */
  sessionEnded(): void
}

export function useIdentityChanges({ accountChanged, sessionEnded }: IdentityChanges): void {
  useEffect(() => {
    const fromAnotherTab = (event: StorageEvent) => {
      // `null` is the storage being cleared altogether.
      if (event.key === lastAccountKey || event.key === null) accountChanged()
    }
    window.addEventListener('storage', fromAnotherTab)
    const stopListening = onSessionEnded(sessionEnded)
    return () => {
      window.removeEventListener('storage', fromAnotherTab)
      stopListening()
    }
  }, [accountChanged, sessionEnded])
}
