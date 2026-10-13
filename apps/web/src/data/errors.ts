import type { ErrorCode, Problem, Schema } from '@draftroom/contract'

/** Every `code` of the contract. A test pins this list to the `ErrorCode` enum of `openapi.yaml`. */
export const errorCodes = [
  'validation-failed',
  'not-found',
  'forbidden',
  'unauthenticated',
  'csrf',
  'revision-conflict',
  'last-owner',
  'rate-limited',
  'too-large',
  'conflict',
  'internal-error',
  'unavailable',
] as const satisfies readonly ErrorCode[]

export function isErrorCode(value: unknown): value is ErrorCode {
  return errorCodes.some((code) => code === value)
}

/** A `revision-conflict` carries the resource as the server holds it, so the client can reconcile and retry. */
export type ProblemBody = Problem | Schema<'DocumentRevisionConflict'> | Schema<'FolderRevisionConflict'>

/**
 * The server refused a request and said why, in the `application/problem+json` the contract defines. Screens branch on
 * `code`, which is stable, and pick the message in the person's language: neither `message` nor the problem's `title`
 * is ever shown.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly problem: ProblemBody

  constructor(problem: ProblemBody) {
    super(problem.title)
    this.name = 'ApiError'
    this.status = problem.status
    this.code = problem.code
    this.problem = problem
  }

  /** The invalid fields of a `validation-failed` or `too-large` answer; empty for any other. */
  get fieldErrors(): readonly Schema<'FieldError'>[] {
    return this.problem.code === 'revision-conflict' ? [] : (this.problem.errors ?? [])
  }
}

/**
 * The request did not end in an answer of the contract: the network failed (`status` is `null`) or something between
 * the client and the API replied with a body that is not a problem, such as a gateway's error page. It has no `code`
 * because the server never said one: it is never mistaken for an `ApiError`.
 */
export class TransportError extends Error {
  readonly status: number | null

  constructor(status: number | null, options?: ErrorOptions) {
    super(
      status === null
        ? 'The request did not end in an answer of the contract'
        : `The server answered ${status} with a body the contract does not define`,
      options,
    )
    this.name = 'TransportError'
    this.status = status
  }
}

/** Narrows to the contract's own errors; with a `code`, to that one. */
export function isApiError(error: unknown, code?: ErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}
