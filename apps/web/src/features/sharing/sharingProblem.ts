import { isApiError } from '../../data/errors.ts'
import type { MessageId } from '../../i18n/messages.ts'
import { problemMessageId } from '../documents/problemMessage.ts'

/**
 * What a refusal says to the person who was changing who has access. The last owner is the one the screen explains
 * in its own words, whatever status carried it: the rest is what every screen says about a refusal.
 */
export function sharingProblemId(error: unknown): MessageId {
  return isApiError(error, 'last-owner') ? 'sharing.error.lastOwner' : problemMessageId(error)
}
