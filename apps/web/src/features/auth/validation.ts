export type EmailProblem = 'required' | 'invalid' | 'tooLong'
export type PasswordProblem = 'required' | 'tooShort' | 'tooLong'

/**
 * The limits of a password in the contract (`Password` in `openapi.yaml`, and `docs/api/README.md`): the generated types
 * cannot carry them and `contractLimits` does not list them, so the form says them from here. They count Unicode code
 * points, as the server does.
 */
export const passwordLimits = { min: 12, max: 128 } as const

/** The longest email the contract takes (`Email`), in code points. */
export const maxEmailLength = 254

const codePoints = (value: string): number => [...value].length

/**
 * What is wrong with an email, which the server will judge again. This only catches what a person can fix before sending:
 * nothing there, no `@` with something on each side, or too long. A stricter rule here would refuse addresses the server
 * accepts.
 */
export function emailProblem(value: string): EmailProblem | null {
  const email = value.trim()
  if (email === '') return 'required'
  if (codePoints(email) > maxEmailLength) return 'tooLong'
  return /^[^\s@]+@[^\s@]+$/.test(email) ? null : 'invalid'
}

/** The password of a new account: its length, and nothing about what it is made of (NIST SP 800-63B). Never trimmed. */
export function signUpPasswordProblem(value: string): PasswordProblem | null {
  const length = codePoints(value)
  if (length === 0) return 'required'
  if (length < passwordLimits.min) return 'tooShort'
  return length > passwordLimits.max ? 'tooLong' : null
}

/** The password of an account that exists: only that it is there and fits, so a shorter one from before the rule is not refused here. */
export function signInPasswordProblem(value: string): Exclude<PasswordProblem, 'tooShort'> | null {
  const length = codePoints(value)
  if (length === 0) return 'required'
  return length > passwordLimits.max ? 'tooLong' : null
}
