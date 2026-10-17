/**
 * The account this browser last signed in with, which is how a sign-in knows that it is a switch: the copies of documents
 * are named for an account, and the ones of the account that was left have to be cleared (protocol §12.2). It is only a
 * hint kept in the browser, so a storage that is not there, or is full, just means that no switch is noticed.
 */
/** Also what other tabs watch: a change to it is another tab signing in or out. */
export const lastAccountKey = 'draftroom-last-account'

export function rememberedAccount(): string | null {
  try {
    return localStorage.getItem(lastAccountKey)
  } catch {
    return null
  }
}

export function rememberAccount(userId: string): void {
  try {
    localStorage.setItem(lastAccountKey, userId)
  } catch {
    // Nothing to do: a sign-in that cannot be remembered is still a sign-in.
  }
}

export function forgetAccount(): void {
  try {
    localStorage.removeItem(lastAccountKey)
  } catch {
    // As above.
  }
}

const leavingKey = 'draftroom-leaving-accounts'

/**
 * The accounts whose copies a switch has yet to decide about. The account the browser holds changes as soon as the session
 * does, which the other tabs need to hear at once, so it can no longer say that an account was left and its question never
 * answered (the tab was closed with the dialog open). This does: it is written before the question and taken back when it has
 * been answered, and the next sign-in asks again about whatever is still there (protocol section 12.2: leaving an account is
 * decided, not forgotten). Not watched by the other tabs: it is no change of who the browser is.
 */
export function accountsBeingLeft(): string[] {
  try {
    const written: unknown = JSON.parse(localStorage.getItem(leavingKey) ?? '[]')
    return Array.isArray(written) && written.every((id) => typeof id === 'string') ? written : []
  } catch {
    return []
  }
}

/** Writes down which accounts are being left, in place of what was there; none removes the key. */
export function markAccountsBeingLeft(userIds: readonly string[]): void {
  try {
    if (userIds.length === 0) localStorage.removeItem(leavingKey)
    else localStorage.setItem(leavingKey, JSON.stringify(userIds))
  } catch {
    // As above: without storage nothing is remembered, and a question left open is not asked again.
  }
}
