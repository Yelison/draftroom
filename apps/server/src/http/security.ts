import type { FastifyInstance } from 'fastify'

/**
 * The headers the API puts on every answer, errors and refusals included. Who sets which header for the page is in
 * ADR 0017: the server answers for `/api`; the proxy that serves the built app answers for the page and its files, and the
 * policy of the page itself is written into `index.html` by the build.
 *
 * An API answer is data, never a page: it has nothing to load (`default-src 'none'`), cannot be framed, and a browser must
 * not guess it is something else (`nosniff`).
 */
const apiSecurityHeaders = {
  'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  // An address in the Referer can hold a document id; the API has no use for where the caller came from.
  'referrer-policy': 'no-referrer',
  // The app uses none of these, so nothing that gets into the page can ask for them.
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()',
} as const

/**
 * A year, which browsers cap anyway; and the subdomains, because the `__Host-` cookies already refuse to be set by one and a
 * subdomain that is served over plain HTTP would be the way round the protection. Not `preload`: that is a list nobody
 * leaves, and the owner of the domain has to choose it.
 */
const strictTransportSecurity = 'max-age=31536000; includeSubDomains'

export interface SecurityOptions {
  /** HSTS only in production: a development server is plain HTTP, and a browser that has learned a host is HTTPS-only will not go back. */
  readonly production: boolean
}

export function securityHeaders({ production }: SecurityOptions): Readonly<Record<string, string>> {
  return production
    ? { ...apiSecurityHeaders, 'strict-transport-security': strictTransportSecurity }
    : apiSecurityHeaders
}

/**
 * Sets them as the answer leaves, in the last `onSend` hook: the contract's hook strips every header from the 500 it
 * substitutes for a response that breaks the contract, and the answer that replaces it needs these as much as any.
 */
export function registerSecurityHeaders(app: FastifyInstance, options: SecurityOptions): void {
  const headers = Object.entries(securityHeaders(options))
  app.addHook('onSend', async (_request, reply, payload) => {
    for (const [name, value] of headers) reply.header(name, value)
    return payload
  })
}
