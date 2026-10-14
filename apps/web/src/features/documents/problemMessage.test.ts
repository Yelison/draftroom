import { describe, expect, it } from 'vitest'
import { ApiError, TransportError, errorCodes } from '../../data/errors.ts'
import type { MessageId } from '../../i18n/messages.ts'
import { problemMessageId } from './problemMessage.ts'

const refusal = (code: (typeof errorCodes)[number]) =>
  new ApiError({ type: 'about:blank', title: 'Server title, never shown', status: 400, code })

describe('what a refusal says', () => {
  // Every code of the contract has a message of its own or the generic one: a new code is a compile error, not a blank.
  it.each<{ code: (typeof errorCodes)[number]; id: MessageId }>([
    { code: 'validation-failed', id: 'problem.validationFailed' },
    { code: 'not-found', id: 'problem.notFound' },
    { code: 'forbidden', id: 'problem.forbidden' },
    { code: 'unauthenticated', id: 'problem.unauthenticated' },
    { code: 'csrf', id: 'problem.unauthenticated' },
    { code: 'too-large', id: 'problem.tooLarge' },
    { code: 'rate-limited', id: 'problem.rateLimited' },
    { code: 'unavailable', id: 'problem.unavailable' },
    { code: 'internal-error', id: 'problem.generic' },
    { code: 'conflict', id: 'problem.generic' },
    { code: 'last-owner', id: 'problem.generic' },
  ])('says $id for $code', ({ code, id }) => {
    expect(problemMessageId(refusal(code))).toBe(id)
  })

  it('says someone else changed it for a revision conflict', () => {
    expect(problemMessageId(refusal('revision-conflict'))).toBe('problem.revisionConflict')
  })

  it('says the server could not be reached when there was no answer of the contract', () => {
    expect(problemMessageId(new TransportError(null))).toBe('problem.network')
    expect(problemMessageId(new Error('anything else'))).toBe('problem.network')
  })
})
