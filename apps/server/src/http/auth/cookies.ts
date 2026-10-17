// Brings the `setCookie` and `clearCookie` of the plugin into the type of a reply.
import type {} from '@fastify/cookie'
import type { FastifyReply } from 'fastify'
import { csrfCookieName, type Csrf } from './csrf.ts'
import type { StartedSession } from './sessions.ts'

/** The cookie that holds the session token. It is `HttpOnly`: nothing in the page can read it. */
export const sessionCookieName = 'dr_session'

/** A value that is not valid percent-encoding is used as it came: a cookie another site set must not fail the request. */
function decoded(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * What the cookies of a request say, read from the `Cookie` header (RFC 6265, section 4.2). Written here and not taken
 * from `@fastify/cookie`, whose parser only works once the plugin has been registered, and the collaboration server reads
 * the headers of a WebSocket upgrade that never went through it. The first of two cookies with the same name is the one
 * that counts. A header that is missing or is a list has no cookies, and so no session.
 */
export function cookiesOf(header: string | string[] | undefined): Readonly<Record<string, string | undefined>> {
  // No prototype, so a cookie named `__proto__` or `constructor` is a cookie and not a way into the object.
  const cookies: Record<string, string | undefined> = Object.create(null) as Record<string, string | undefined>
  if (typeof header !== 'string') return cookies
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    const name = pair.slice(0, separator).trim()
    if (separator === -1 || name === '' || name in cookies) continue
    const raw = pair.slice(separator + 1).trim()
    cookies[name] = decoded(raw.startsWith('"') && raw.endsWith('"') && raw.length > 1 ? raw.slice(1, -1) : raw)
  }
  return cookies
}

export interface SessionCookies {
  /** Sets the session cookie and the CSRF cookie, which end when the session's absolute lifetime does. */
  issue(reply: FastifyReply, session: Pick<StartedSession, 'token' | 'expiresAt'>): void
  /** Ends both in the browser. */
  clear(reply: FastifyReply): void
}

export interface SessionCookiesOptions {
  readonly csrf: Csrf
  /** `Secure` in production, where the app is served over HTTPS; a development server is plain HTTP, which would never send it back. */
  readonly secure: boolean
}

/**
 * `SameSite=Lax` keeps the session out of requests another site starts with anything but a link, and is the first line
 * against CSRF (the token is the second). The CSRF cookie is the one the page reads, so it is not `HttpOnly`; the session
 * cookie is.
 */
export function createSessionCookies({ csrf, secure }: SessionCookiesOptions): SessionCookies {
  const attributes = { path: '/', sameSite: 'lax', secure } as const
  return {
    issue(reply, { token, expiresAt }) {
      reply
        .setCookie(sessionCookieName, token, { ...attributes, httpOnly: true, expires: expiresAt })
        .setCookie(csrfCookieName, csrf.tokenFor(token), { ...attributes, httpOnly: false, expires: expiresAt })
    },
    clear(reply) {
      reply
        .clearCookie(sessionCookieName, { ...attributes, httpOnly: true })
        .clearCookie(csrfCookieName, { ...attributes, httpOnly: false })
    },
  }
}
