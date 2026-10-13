import type { Schema } from '@draftroom/contract'
import { invalid, tooLarge } from './problems.ts'

type FieldError = Schema<'FieldError'>

export interface TextLimits {
  min: number
  max: number
}

/** The length the contract counts: Unicode code points, never UTF-16 units. */
export const codePoints = (value: string): number => [...value].length

/**
 * The field errors of the texts of a request body, in the order of the contract's checks: a text over its maximum is
 * `413 too-large`, and an empty one, or one under its minimum, is `400 validation-failed`. When both happen at once the
 * body is too large, because the size of a body is judged before its rules.
 */
export function checkTexts(
  ...fields: readonly (readonly [pointer: string, value: string, limits: TextLimits])[]
): void {
  const tooLong: FieldError[] = []
  const tooShort: FieldError[] = []
  for (const [pointer, value, { min, max }] of fields) {
    const length = codePoints(value)
    if (length > max) tooLong.push({ pointer, code: 'too-long' })
    else if (length < min) tooShort.push({ pointer, code: 'too-short' })
  }
  if (tooLong.length > 0) throw tooLarge(...tooLong)
  if (tooShort.length > 0) throw invalid(...tooShort)
}

/** A query or path parameter out of range is always `400`, never `413`: only texts in a body are "too large". */
export function checkParameterText(pointer: string, value: string, { min, max }: TextLimits): void {
  const length = codePoints(value)
  if (length > max) throw invalid({ pointer, code: 'too-long' })
  if (length < min) throw invalid({ pointer, code: 'too-short' })
}
