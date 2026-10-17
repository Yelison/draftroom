import type { Kysely } from 'kysely'
import type { Config } from '../../config.ts'
import type { Database } from '../../db/tables.ts'
import type { AuthProvider } from './auth-provider.ts'
import { createCookieSessions, withDevelopmentIdentity } from './cookie-session.ts'
import { cookieNamesFor, createSessionCookies, type SessionCookies } from './cookies.ts'
import { createCsrf } from './csrf.ts'
import { createDevices, type Devices } from './devices.ts'
import { createDevIdentity } from './devIdentity.ts'
import type { Sessions } from './sessions.ts'

/**
 * The provider for a configuration. A session cookie identifies the caller everywhere. The development identity
 * (`X-Dev-User`) is added behind it only when the configuration says it may serve, which it does only for an explicit
 * `NODE_ENV` of `development` or `test`; in every other case, a missing variable and `production` included, there is the
 * session and nothing else, so a mistake in the environment fails closed.
 */
export function authProviderFor(
  { devIdentity, nodeEnv, sessionSecret }: Pick<Config, 'devIdentity' | 'nodeEnv' | 'sessionSecret'>,
  database: Kysely<Database>,
  sessions: Sessions,
): AuthProvider {
  const cookieSessions = createCookieSessions({
    sessions,
    csrf: createCsrf(sessionSecret),
    names: cookieNamesFor(servedOverHttps(nodeEnv)),
  })
  return devIdentity ? withDevelopmentIdentity(cookieSessions, createDevIdentity(database)) : cookieSessions
}

/**
 * Whether the app is served over HTTPS, which decides if its cookies are `Secure` and `__Host-`: exactly when the server is in
 * production. A server with no `NODE_ENV` is not production here either, as for the rest of the configuration; the deployment sets it.
 */
const servedOverHttps = (nodeEnv: Config['nodeEnv']): boolean => nodeEnv === 'production'

/** The cookies the sessions set. */
export function sessionCookiesFor({
  nodeEnv,
  sessionSecret,
}: Pick<Config, 'nodeEnv' | 'sessionSecret'>): SessionCookies {
  return createSessionCookies({ csrf: createCsrf(sessionSecret), secure: servedOverHttps(nodeEnv) })
}

/** The device cookie, which tells the limit on sign-in attempts that a browser has signed in to an account before. */
export function devicesFor({ nodeEnv, sessionSecret }: Pick<Config, 'nodeEnv' | 'sessionSecret'>): Devices {
  const secure = servedOverHttps(nodeEnv)
  return createDevices({ secret: sessionSecret, cookieName: cookieNamesFor(secure).device, secure })
}
