import type { ErrorObject } from 'ajv/dist/2020.js'
import type { FieldErrorCode, Schema } from '@draftroom/contract'

type FieldError = Schema<'FieldError'>

/** Where in the request a validated value lives: it becomes the start of the JSON Pointer of each error. */
export type RequestPart = 'body' | 'query' | 'path'

const codeByKeyword: Readonly<Record<string, FieldErrorCode>> = {
  required: 'required',
  dependentRequired: 'required',
  // `minProperties` is how the contract says "at least one of these fields".
  minProperties: 'required',
  minLength: 'too-short',
  minItems: 'too-short',
  maxLength: 'too-long',
  maxItems: 'too-long',
  additionalProperties: 'unknown-field',
  unevaluatedProperties: 'unknown-field',
  format: 'invalid-format',
  pattern: 'invalid-format',
}

const escapePointerSegment = (segment: string): string => segment.replaceAll('~', '~0').replaceAll('/', '~1')

/** The property an error is about, for the keywords that report a missing or extra property on the parent object. */
function propertyOf(error: ErrorObject): string | undefined {
  const params: Readonly<Record<string, unknown>> = error.params
  const name = params['missingProperty'] ?? params['additionalProperty']
  return typeof name === 'string' ? name : undefined
}

// Ajv also reports every branch of a failed `oneOf` or `anyOf`; the branch errors say nothing the combined one does not.
const isBranchError = (error: ErrorObject): boolean => /\/(oneOf|anyOf)\/\d+\//.test(error.schemaPath)

/**
 * Turns Ajv errors into the contract's `errors[]`: a JSON Pointer and a stable code, never a message. Each field is
 * reported once, with the first reason found.
 */
export function toFieldErrors(part: RequestPart, errors: readonly ErrorObject[]): FieldError[] {
  const prefix = part === 'body' ? '' : `/${part}`
  const seen = new Set<string>()
  const fieldErrors: FieldError[] = []

  for (const error of errors.filter((candidate) => !isBranchError(candidate))) {
    const property = propertyOf(error)
    const pointer = `${prefix}${error.instancePath}${property === undefined ? '' : `/${escapePointerSegment(property)}`}`
    const code = codeByKeyword[error.keyword] ?? 'invalid-value'
    const fieldError = { pointer: pointer === '' ? '/' : pointer, code }
    if (seen.has(fieldError.pointer)) continue
    seen.add(fieldError.pointer)
    fieldErrors.push(fieldError)
  }
  return fieldErrors
}
