import type { FastifyInstance } from 'fastify'
import { createDatabase } from '../../src/db/database.ts'
import { buildApp, type AppDependencies } from '../../src/http/app.ts'
import type { AuthProvider } from '../../src/http/auth/auth-provider.ts'
import { sessionStackFor } from './auth.ts'
import { noLiveDocuments, silentBroadcaster, silentLiveAccess } from './broadcasters.ts'
import { developmentHardening, unlimitedRequests } from './hardening.ts'
import { unreachableDatabaseUrl } from './unreachable-database.ts'

/** Everyone who sends `X-Test-Session` is the person of that session, and nobody else is signed in. */
export const sessionFromHeader: AuthProvider = {
  authenticate: ({ headers }) => {
    const sessionId = headers['x-test-session']
    return Promise.resolve(
      typeof sessionId === 'string'
        ? { status: 'authenticated', principal: { userId: '5b8f7a3e-2d4c-4e1b-8a6f-1c9d3e7b0a11', sessionId } }
        : { status: 'unauthenticated' },
    )
  },
}

type Overrides = Partial<Pick<AppDependencies, 'hardening' | 'requestLimits' | 'authProvider'>>

/**
 * The real app with a database nobody can reach: what it does before a handler runs (the headers, CORS, the limits, the
 * body size) is visible without a PostgreSQL, and a request that gets as far as a handler answers `500`. The caller closes it.
 */
export function appWithoutDatabase({
  hardening = developmentHardening,
  requestLimits = unlimitedRequests,
  authProvider = sessionFromHeader,
}: Overrides = {}): FastifyInstance {
  const database = createDatabase(unreachableDatabaseUrl)
  const { sessions, sessionCookies } = sessionStackFor(database)
  const app = buildApp({
    database,
    hardening,
    requestLimits,
    authProvider,
    sessions,
    sessionCookies,
    broadcaster: silentBroadcaster,
    liveAccess: silentLiveAccess,
    liveDocuments: noLiveDocuments,
  })
  app.addHook('onClose', () => database.destroy())
  return app
}
