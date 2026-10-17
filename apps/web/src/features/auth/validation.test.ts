import { describe, expect, it } from 'vitest'
import { emailProblem, passwordLimits, signInPasswordProblem, signUpPasswordProblem } from './validation.ts'

describe('the email of an account', () => {
  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['marta', 'invalid'],
    ['marta@', 'invalid'],
    ['@harborpine.example', 'invalid'],
    ['marta ruiz@harborpine.example', 'invalid'],
    ['marta@harborpine.example', null],
    ['  marta@harborpine.example  ', null],
    ['marta+drafts@harborpine.example', null],
    [`${'a'.repeat(250)}@b.co`, 'tooLong'],
  ])('%j is %s', (value, problem) => {
    expect(emailProblem(value)).toBe(problem)
  })
})

describe('the password of a new account', () => {
  it('has the limits of the contract, which the form has to know to say them', () => {
    expect(passwordLimits).toEqual({ min: 12, max: 128 })
  })

  it.each([
    ['', 'required'],
    ['a'.repeat(11), 'tooShort'],
    ['a'.repeat(12), null],
    ['a'.repeat(128), null],
    ['a'.repeat(129), 'tooLong'],
    // The limits count code points, as the server does: an emoji is one, though JavaScript's length says two.
    ['🔑'.repeat(12), null],
    ['🔑'.repeat(11), 'tooShort'],
    ['🔑'.repeat(129), 'tooLong'],
    // No rules of composition: nothing but spaces is still a password, if it is long enough.
    [' '.repeat(12), null],
  ])('%j is %s', (value, problem) => {
    expect(signUpPasswordProblem(value)).toBe(problem)
  })
})

describe('the password of an account that exists', () => {
  it('is only checked for being there and fitting, so that a password from before the rules is never refused here', () => {
    expect([signInPasswordProblem(''), signInPasswordProblem('short'), signInPasswordProblem('a'.repeat(129))]).toEqual(
      ['required', null, 'tooLong'],
    )
  })
})
