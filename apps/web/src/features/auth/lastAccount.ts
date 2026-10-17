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
