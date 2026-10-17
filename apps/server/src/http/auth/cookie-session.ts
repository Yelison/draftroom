import type { AuthProvider, Authentication } from './auth-provider.ts'
import { cookiesOf, type CookieNames } from './cookies.ts'
import { csrfHeaderName, type Csrf } from './csrf.ts'
import type { Sessions } from './sessions.ts'

export interface CookieSessionsOptions {
  readonly sessions: Sessions
  readonly csrf: Csrf
  /** The names this deployment's cookies have; the others are not read, whatever they hold. */
  readonly names: Pick<CookieNames, 'session' | 'csrf'>
}

const unauthenticated: Authentication = { status: 'unauthenticated' }

/**
 * Who is calling, from the session cookie: the session first (401) and then, for a request that changes something, the
 * CSRF token (403), the first two checks of the order of `docs/api/README.md`. It reads the `Cookie` header itself and not
 * a parsed `request.cookies`, because the collaboration server calls it with the headers of a WebSocket upgrade, which no
 * Fastify plugin has seen.
 */
export function createCookieSessions({ sessions, csrf, names }: CookieSessionsOptions): AuthProvider {
  return {
    async authenticate({ headers }, { csrf: needsCsrf }) {
      const cookies = cookiesOf(headers.cookie)
      const token = cookies[names.session]
      if (token === undefined || token === '') return unauthenticated

      const session = await sessions.resolve(token)
      if (session === null) return unauthenticated

      const header = headers[csrfHeaderName]
      if (
        needsCsrf &&
        !csrf.accepts(token, {
          cookie: cookies[names.csrf],
          header: typeof header === 'string' ? header : undefined,
        })
      ) {
        return { status: 'csrf-rejected' }
      }
      return { status: 'authenticated', principal: { userId: session.userId, sessionId: session.id } }
    },
  }
}

/**
 * For `development` and `test`: a session cookie wins when there is a valid one, and the development header (ADR 0010)
 * serves when there is none. A request with a session is checked as any other, so the header is never a way around the
 * CSRF token of a session that is there; the header alone carries no token, as it never did.
 */
export function withDevelopmentIdentity(sessions: AuthProvider, development: AuthProvider): AuthProvider {
  return {
    async authenticate(request, requirement) {
      const authentication = await sessions.authenticate(request, requirement)
      return authentication.status === 'unauthenticated'
        ? development.authenticate(request, requirement)
        : authentication
    },
  }
}
