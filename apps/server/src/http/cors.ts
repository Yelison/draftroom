import type { FastifyInstance } from 'fastify'

/**
 * The methods and headers a page of an allowed origin may use. `X-Dev-User` is not among the headers and never will be:
 * a browser cannot send a header the preflight did not allow, which is what keeps another site from using the development
 * identity (ADR 0010).
 */
const allowedMethods = 'GET, POST, PUT, PATCH, DELETE'
const allowedHeaders = 'Content-Type, X-CSRF-Token'
/** A browser may remember a preflight for ten minutes; Chromium caps it at two hours and Firefox at one day anyway. */
const preflightMaxAgeSeconds = 600

const firstValue = (header: string | string[] | undefined): string | undefined =>
  typeof header === 'string' ? header : undefined

/** Adds `name` to the `Vary` header without dropping what another hook put there. */
function varyOn(current: unknown, name: string): string {
  const names = typeof current === 'string' ? current.split(',').map((entry) => entry.trim()) : []
  return [...new Set([...names, name])].join(', ')
}

/**
 * CORS for the origins of `ALLOWED_ORIGINS` and no others (ADR 0017). The list is explicit: there is no `*`, and the origin
 * is echoed only if it is in the list, so credentials are never allowed to a site that is not one of ours. Cookies are
 * sent with `credentials: 'include'`, and a browser refuses to send them when the answer says `*`.
 *
 * Nothing here decides who may call: the session and the CSRF token do. This only lets a browser show the answer to a page
 * of one of the origins, and tells it not to show it to any other.
 */
export function registerCors(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  const allows = (origin: string | undefined): origin is string =>
    origin !== undefined && allowedOrigins.includes(origin)

  // The preflight is answered before routing, because the contract has no `OPTIONS` operations and the 404 of the router
  // would carry none of these headers. A preflight from an origin that is not allowed gets no `Access-Control-*` headers,
  // which is how a browser is told no.
  app.addHook('onRequest', async (request, reply) => {
    const origin = firstValue(request.headers.origin)
    if (request.method !== 'OPTIONS' || origin === undefined) return
    if (firstValue(request.headers['access-control-request-method']) === undefined) return

    if (allows(origin)) {
      reply
        .header('access-control-allow-origin', origin)
        .header('access-control-allow-credentials', 'true')
        .header('access-control-allow-methods', allowedMethods)
        .header('access-control-allow-headers', allowedHeaders)
        .header('access-control-max-age', preflightMaxAgeSeconds)
    }
    return reply
      .header('vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers')
      .code(204)
      .send()
  })

  app.addHook('onSend', async (request, reply, payload) => {
    const origin = firstValue(request.headers.origin)
    if (origin === undefined) return payload
    // The answer depends on who asked, so a cache must not give it to someone else.
    reply.header('vary', varyOn(reply.getHeader('vary'), 'Origin'))
    if (allows(origin) && reply.getHeader('access-control-allow-origin') === undefined) {
      reply
        .header('access-control-allow-origin', origin)
        .header('access-control-allow-credentials', 'true')
        // A page can read how long to wait when it is told to slow down; it can read no other header that is not simple.
        .header('access-control-expose-headers', 'Retry-After')
    }
    return payload
  })
}
