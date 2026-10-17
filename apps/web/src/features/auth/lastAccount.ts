/**
 * The account this browser last signed in with, which is how a sign-in knows that it is a switch: the copies of documents
 * are named for an account, and the ones of the account that was left have to be cleared (protocol §12.2). It is only a
 * hint kept in the browser, so a storage that is not there, or is full, just means that no switch is noticed.
 */
const key = 'draftroom-last-account'

export function rememberedAccount(): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function rememberAccount(userId: string): void {
  try {
    localStorage.setItem(key, userId)
  } catch {
    // Nothing to do: a sign-in that cannot be remembered is still a sign-in.
  }
}

export function forgetAccount(): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // As above.
  }
}
