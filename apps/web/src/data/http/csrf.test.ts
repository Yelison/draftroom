import { describe, expect, it } from 'vitest'
import { changesState, cookieValue } from './csrf.ts'

describe('cookieValue', () => {
  it.each([
    ['dr_csrf=abc', 'abc'],
    ['theme=dark; dr_csrf=abc; other=1', 'abc'],
    ['dr_csrf=a%2Bb%3D', 'a+b='],
    ['  dr_csrf = padded ', 'padded'],
    ['xdr_csrf=wrong; dr_csrf=right', 'right'],
    ['dr_csrf=%E0%A4%A', '%E0%A4%A'],
  ])('reads dr_csrf from %j', (cookies, expected) => {
    expect(cookieValue(cookies, 'dr_csrf')).toBe(expected)
  })

  it.each([[''], ['theme=dark'], ['dr_csrf_other=1'], ['dr_csrf'], ['dr_csrfx']])('finds nothing in %j', (cookies) => {
    expect(cookieValue(cookies, 'dr_csrf')).toBeUndefined()
  })
})

describe('changesState', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post'])('is true for %s', (method) => {
    expect(changesState(method)).toBe(true)
  })

  it.each(['GET', 'HEAD', 'OPTIONS'])('is false for %s', (method) => {
    expect(changesState(method)).toBe(false)
  })
})
