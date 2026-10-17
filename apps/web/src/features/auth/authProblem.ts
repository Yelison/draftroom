import { isApiError } from '../../data/errors.ts'
import type { MessageId } from '../../i18n/messages.ts'
import { problemMessageId } from '../documents/problemMessage.ts'

/**
 * What a refused sign-in says, chosen by the `code` the server gave. A wrong password and an address with no account are
 * the same `unauthenticated` and so the same sentence: the screen never says which accounts exist, as the server does not.
 */
export function signInFailureMessage(error: unknown): MessageId {
  if (isApiError(error, 'unauthenticated')) return 'auth.signIn.problem.credentials'
  if (isApiError(error, 'rate-limited')) return 'auth.problem.rateLimited'
  return problemMessageId(error)
}

/** What a refused sign-up says: an address that already has an account, too many attempts, or the common answers. */
export function signUpFailureMessage(error: unknown): MessageId {
  if (isApiError(error, 'conflict')) return 'auth.signUp.problem.emailTaken'
  if (isApiError(error, 'rate-limited')) return 'auth.problem.rateLimited'
  return problemMessageId(error)
}
