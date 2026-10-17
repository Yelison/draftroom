import type { MessageId } from '../../i18n/messages.ts'
import { isApiError } from '../../data/errors.ts'
import { problemMessageId } from '../documents/problemMessage.ts'

/**
 * What a refused restore says. `conflict` is the one the contract gives it: people kept editing the document, so it could
 * not be replaced, and nothing was changed. It is worth saying so, because the owner can simply ask again.
 */
export const restoreProblemId = (error: unknown): MessageId =>
  isApiError(error, 'conflict') ? 'versions.restore.conflict' : problemMessageId(error)
