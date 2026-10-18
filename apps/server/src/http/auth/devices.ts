// Brings the `setCookie` of the plugin into the type of a reply.
import type {} from '@fastify/cookie'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyReply } from 'fastify'
import { cookiesOf } from './cookies.ts'
import { keyOfEmail } from './emailKey.ts'

export interface Devices {
  /**
   * The identity of this browser for this address of email, when it holds a cookie that this server made for it after a
   * sign-in that was right; `null` for any other browser, including one that holds a cookie made for another address.
   * Synchronous, so the limit can look at it before it awaits anything.
   */
  recognise(cookieHeader: string | string[] | undefined, email: string): string | null
  /** Leaves the cookie in the browser after a sign-in or sign-up that succeeded; a browser already known keeps its identity. */
  remember(reply: FastifyReply, email: string, recognised: string | null): void
}

export interface DevicesOptions {
  /** The secret of the server: a cookie nobody has the secret for is a cookie nobody can make. */
  readonly secret: string
  readonly cookieName: string
  readonly secure: boolean
}

/** Six months: long enough that a person who comes back every few weeks is still known, short enough to forget a browser nobody uses. */
const lifetimeMs = 180 * 24 * 60 * 60 * 1000

/**
 * The device cookie of OWASP's Authentication Cheat Sheet. A browser that has signed in to an account right has a cookie
 * that says so, and the limit on failed sign-ins counts such a browser on its own, so that someone who sends wrong
 * passwords for an address from anywhere cannot lock its owner out of the browser they already use (ADR 0004).
 *
 * The cookie is `<random id>.<HMAC of the id and the address>` under the server's secret: no table, no migration, and
 * one made for an address is of no use for another. The random id is what tells two browsers of one person apart, so a
 * stolen cookie is limited on its own and does not free everybody from the limit of the address. Rotating the secret
 * forgets every device, which is also how all of them are revoked at once.
 */
export function createDevices({ secret, cookieName, secure }: DevicesOptions): Devices {
  const signatureOf = (email: string, id: string): string =>
    createHmac('sha256', secret)
      .update(`device:${keyOfEmail(email)}:${id}`)
      .digest('base64url')
  const valueOf = (email: string, id: string): string => `${id}.${signatureOf(email, id)}`

  return {
    recognise(cookieHeader, email) {
      const value = cookiesOf(cookieHeader)[cookieName]
      const [id, signature, ...rest] = (value ?? '').split('.')
      if (id === undefined || id === '' || signature === undefined || rest.length > 0) return null
      const expected = Buffer.from(signatureOf(email, id))
      const given = Buffer.from(signature)
      return given.length === expected.length && timingSafeEqual(given, expected) ? id : null
    },

    remember(reply, email, recognised) {
      const id = recognised ?? randomBytes(16).toString('base64url')
      // `Strict`: the cookie is only sent by our own pages, so a sign-in another site starts is the one of an unknown browser.
      reply.setCookie(cookieName, valueOf(email, id), {
        path: '/',
        sameSite: 'strict',
        secure,
        httpOnly: true,
        expires: new Date(Date.now() + lifetimeMs),
      })
    },
  }
}
