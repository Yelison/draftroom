import { describe, expect, it } from 'vitest'
import { destinationAfterSignIn, redirectState } from './redirect.ts'

describe('where a person goes after signing in', () => {
  it('is where they were going, with its search and hash, when the router kept it', () => {
    const state = redirectState({ pathname: '/documents', search: '?q=plan', hash: '#top' })

    expect(destinationAfterSignIn(state)).toBe('/documents?q=plan#top')
  })

  it('is the home page when they came to sign in on their own', () => {
    expect(destinationAfterSignIn(null)).toBe('/')
  })

  it.each([
    ['an address on another site', { from: 'https://evil.example/phish' }],
    ['a protocol-relative address', { from: '//evil.example/phish' }],
    ['a backslash that browsers read as a slash', { from: '/\\evil.example' }],
    ['a script', { from: 'javascript:alert(1)' }],
    ['a path that does not start with a slash', { from: 'documents' }],
    ['the sign-in page itself, which would loop', { from: '/sign-in' }],
    ['the sign-up page', { from: '/sign-up?x=1' }],
    ['something that is not a string', { from: 42 }],
    ['state that is not an object', 'documents'],
    ['state with no destination', {}],
  ])('is the home page for %s', (_case, state) => {
    expect(destinationAfterSignIn(state)).toBe('/')
  })
})
