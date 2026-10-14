import type { ErrorCode } from '@draftroom/contract'
import { isApiError } from '../../data/errors.ts'
import type { MessageId } from '../../i18n/messages.ts'

/**
 * What a refusal of the contract says to the person, by its stable `code`. The server's own `title` and `message` are
 * never shown: they are for logs, and are not in the person's language.
 */
const messageOf = {
  'validation-failed': 'problem.validationFailed',
  'not-found': 'problem.notFound',
  forbidden: 'problem.forbidden',
  unauthenticated: 'problem.unauthenticated',
  csrf: 'problem.unauthenticated',
  'revision-conflict': 'problem.revisionConflict',
  'last-owner': 'problem.generic',
  'rate-limited': 'problem.rateLimited',
  'too-large': 'problem.tooLarge',
  conflict: 'problem.generic',
  'internal-error': 'problem.generic',
  unavailable: 'problem.unavailable',
} as const satisfies Record<ErrorCode, MessageId>

/** A request that ended without an answer of the contract (the network failed, a gateway answered) has no `code`. */
export function problemMessageId(error: unknown): MessageId {
  return isApiError(error) ? messageOf[error.code] : 'problem.network'
}
