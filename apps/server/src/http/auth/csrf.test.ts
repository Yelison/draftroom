import { describe, expect, it } from 'vitest'
import { createCsrf } from './csrf.ts'

const csrf = createCsrf('a-secret-that-is-long-enough-for-an-hmac')
const session = 'session-token-of-marta'

describe('the CSRF token of a session', () => {
  it('is the same every time for the same session, and a different one for another', () => {
    expect(csrf.tokenFor(session)).toBe(csrf.tokenFor(session))
    expect(csrf.tokenFor(session)).not.toBe(csrf.tokenFor('session-token-of-eli'))
  })

  it('depends on the secret of the server, so it cannot be worked out from the session', () => {
    expect(createCsrf('another-secret-that-is-long-enough-for-hmac').tokenFor(session)).not.toBe(csrf.tokenFor(session))
  })

  it('does not hold the session token, which the cookie of the page can then show', () => {
    expect(csrf.tokenFor(session)).not.toContain(session)
  })
})

describe('a request that changes something', () => {
  const token = csrf.tokenFor(session)

  it.each([
    ['carries the token in the cookie and in the header', token, token, true],
    ['has no header', token, undefined, false],
    ['has no cookie', undefined, token, false],
    ['has neither', undefined, undefined, false],
    ['has a header that is not the cookie', token, csrf.tokenFor('session-token-of-eli'), false],
    ['has the right header and another cookie', 'a-cookie-planted-by-someone', token, false],
    ['has an empty cookie and an empty header', '', '', false],
    // Two values that match each other but that this server never issued for this session: what someone who can set a
    // cookie for the site (a sibling subdomain) and send the header would have.
    ['has a cookie and a header that match and are not the session’s', 'forged-by-someone', 'forged-by-someone', false],
    [
      'has the token of another session in both',
      csrf.tokenFor('session-token-of-eli'),
      csrf.tokenFor('session-token-of-eli'),
      false,
    ],
  ] as const)('%s', (_case, cookie, header, accepted) => {
    expect(csrf.accepts(session, { cookie, header })).toBe(accepted)
  })
})
