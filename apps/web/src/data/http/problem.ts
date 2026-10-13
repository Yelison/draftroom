import type { Schema } from '@draftroom/contract'
import { ApiError, isErrorCode, TransportError, type ProblemBody } from '../errors.ts'

/** Every `code` of a field error. A test pins this list to the `FieldErrorCode` enum of `openapi.yaml`. */
export const fieldErrorCodes = [
  'required',
  'too-short',
  'too-long',
  'invalid-format',
  'invalid-value',
  'unknown-field',
] as const satisfies readonly Schema<'FieldError'>['code'][]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFieldError(value: unknown): value is Schema<'FieldError'> {
  return isRecord(value) && typeof value.pointer === 'string' && fieldErrorCodes.some((code) => code === value.code)
}

/**
 * Whether a parsed body is an RFC 9457 problem of the contract. The `current` of a `revision-conflict` is checked only
 * for being a resource: its full shape is the server's to keep, and the contract tests of the real server pin it.
 */
function isProblemBody(value: unknown): value is ProblemBody {
  if (!isRecord(value)) return false
  const { type, title, status, code, errors, current } = value
  if (typeof type !== 'string' || typeof title !== 'string' || typeof status !== 'number' || !isErrorCode(code)) {
    return false
  }
  if (errors !== undefined && !(Array.isArray(errors) && errors.every(isFieldError))) return false
  return code !== 'revision-conflict' || (isRecord(current) && typeof current.id === 'string')
}

/**
 * The error of a response that was not a success: the contract's `ApiError` when the body is a problem, a
 * `TransportError` for anything else (a gateway's HTML page, an empty body), which has no `code` to branch on.
 */
export function failureOf(response: Response, body: unknown): ApiError | TransportError {
  const isProblemResponse = response.headers.get('Content-Type')?.includes('application/problem+json') === true
  return isProblemResponse && isProblemBody(body) ? new ApiError(body) : new TransportError(response.status)
}
