import { afterEach, describe, expect, it, vi } from 'vitest'
import { changesState, cookieValue, csrfTokenFromCookie } from './csrf.ts'

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

describe('csrfTokenFromCookie', () => {
  // jsdom refuses to set a `__Host-` cookie on an address that is not HTTPS, so the cookie string is what is stubbed.
  const cookiesAre = (cookies: string) => vi.spyOn(document, 'cookie', 'get').mockReturnValue(cookies)
  afterEach(() => vi.restoreAllMocks())

  it('reads the cookie a server behind HTTPS sets, with the __Host- prefix', () => {
    cookiesAre('theme=dark; __Host-dr_csrf=prefixed')

    expect(csrfTokenFromCookie()).toBe('prefixed')
  })

  it('reads the cookie a development server sets, with no prefix', () => {
    cookiesAre('dr_csrf=plain')

    expect(csrfTokenFromCookie()).toBe('plain')
  })

  it('prefers the prefixed one when a plain one has been planted beside it', () => {
    cookiesAre('dr_csrf=planted; __Host-dr_csrf=real')

    expect(csrfTokenFromCookie()).toBe('real')
  })

  it('finds nothing when there is no session', () => {
    cookiesAre('theme=dark')

    expect(csrfTokenFromCookie()).toBeUndefined()
  })
})
