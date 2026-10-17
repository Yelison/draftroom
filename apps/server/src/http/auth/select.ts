import type { Kysely } from 'kysely'
import type { Config } from '../../config.ts'
import type { Database } from '../../db/tables.ts'
import type { AuthProvider } from './auth-provider.ts'
import { createCookieSessions, withDevelopmentIdentity } from './cookie-session.ts'
import { createSessionCookies, type SessionCookies } from './cookies.ts'
import { createCsrf } from './csrf.ts'
import { createDevIdentity } from './devIdentity.ts'
import type { Sessions } from './sessions.ts'

/**
 * The provider for a configuration. A session cookie identifies the caller everywhere. The development identity
 * (`X-Dev-User`) is added behind it only when the configuration says it may serve, which it does only for an explicit
 * `NODE_ENV` of `development` or `test`; in every other case, a missing variable and `production` included, there is the
 * session and nothing else, so a mistake in the environment fails closed.
 */
export function authProviderFor(
  { devIdentity, sessionSecret }: Pick<Config, 'devIdentity' | 'sessionSecret'>,
  database: Kysely<Database>,
  sessions: Sessions,
): AuthProvider {
  const cookieSessions = createCookieSessions({ sessions, csrf: createCsrf(sessionSecret) })
  return devIdentity ? withDevelopmentIdentity(cookieSessions, createDevIdentity(database)) : cookieSessions
}

/**
 * The cookies the sessions set, `Secure` exactly when the server is in production, where it is served over HTTPS. A server
 * with no `NODE_ENV` is not production here either, as for the rest of the configuration; the deployment sets it.
 */
export function sessionCookiesFor({
  nodeEnv,
  sessionSecret,
}: Pick<Config, 'nodeEnv' | 'sessionSecret'>): SessionCookies {
  return createSessionCookies({ csrf: createCsrf(sessionSecret), secure: nodeEnv === 'production' })
}
