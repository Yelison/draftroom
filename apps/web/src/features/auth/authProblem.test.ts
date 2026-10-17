import type { ErrorCode } from '@draftroom/contract'
import { describe, expect, it } from 'vitest'
import { ApiError, TransportError } from '../../data/errors.ts'
import { signInFailureMessage, signUpFailureMessage } from './authProblem.ts'

const refusal = (code: ErrorCode, status: number) =>
  new ApiError({ type: 'about:blank', title: 'Refused', status, code })

describe('what a refused sign-in says', () => {
  it.each([
    ['unauthenticated', 401, 'auth.signIn.problem.credentials'],
    ['rate-limited', 429, 'auth.problem.rateLimited'],
    ['validation-failed', 400, 'problem.validationFailed'],
    ['too-large', 413, 'problem.tooLarge'],
    ['unavailable', 503, 'problem.unavailable'],
    ['internal-error', 500, 'problem.generic'],
  ] as const)('is, for %s, the message %s', (code, status, message) => {
    expect(signInFailureMessage(refusal(code, status))).toBe(message)
  })

  it('does not tell a wrong password from an unknown account: both are the one message', () => {
    expect(signInFailureMessage(refusal('unauthenticated', 401))).toBe('auth.signIn.problem.credentials')
  })

  it('says the connection failed when the server never answered', () => {
    expect(signInFailureMessage(new TransportError(null))).toBe('problem.network')
  })
})

describe('what a refused sign-up says', () => {
  it.each([
    ['conflict', 409, 'auth.signUp.problem.emailTaken'],
    ['rate-limited', 429, 'auth.problem.rateLimited'],
    ['validation-failed', 400, 'problem.validationFailed'],
    ['too-large', 413, 'problem.tooLarge'],
    ['internal-error', 500, 'problem.generic'],
  ] as const)('is, for %s, the message %s', (code, status, message) => {
    expect(signUpFailureMessage(refusal(code, status))).toBe(message)
  })

  it('says the connection failed when the server never answered', () => {
    expect(signUpFailureMessage(new TransportError(null))).toBe('problem.network')
  })
})
