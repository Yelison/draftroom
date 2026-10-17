import { createHmac, timingSafeEqual } from 'node:crypto'

/** The cookie that carries the token, which the page reads to put it in the header. */
export const csrfCookieName = 'dr_csrf'
/** The header it is echoed in, as Node names a header: lower case. */
export const csrfHeaderName = 'x-csrf-token'

export interface Csrf {
  /** The token of the session whose cookie holds `sessionToken`. */
  tokenFor(sessionToken: string): string
  /** Whether a request that changes something carries the token of its session, in the cookie and in the header. */
  accepts(
    sessionToken: string,
    sent: { readonly cookie: string | undefined; readonly header: string | undefined },
  ): boolean
}

const sameBytes = (left: string, right: string): boolean => {
  const [a, b] = [Buffer.from(left), Buffer.from(right)]
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Double submit, signed. The token is an HMAC of the session token under the server's secret: the cookie and the header
 * must match each other, which another origin cannot arrange because it cannot read the cookie, and must also be the
 * token of this session, which someone who can only plant cookies cannot arrange because they cannot compute it. A
 * token that was not bound to the session would let a planted cookie and a header that repeats it pass.
 */
export function createCsrf(secret: string): Csrf {
  const tokenFor = (sessionToken: string) =>
    createHmac('sha256', secret).update(`csrf:${sessionToken}`).digest('base64url')
  return {
    tokenFor,
    accepts(sessionToken, { cookie, header }) {
      if (cookie === undefined || header === undefined) return false
      return sameBytes(cookie, header) && sameBytes(header, tokenFor(sessionToken))
    },
  }
}
