import type { Kysely } from 'kysely'
import type { Config } from '../../config.ts'
import type { Database } from '../../db/tables.ts'
import type { AuthProvider } from './auth-provider.ts'
import { createDevIdentity } from './devIdentity.ts'

/** Until sign-in exists (T7.1) a production server knows nobody, so it serves the health probes and nothing else. */
const nobody: AuthProvider = { authenticate: () => Promise.resolve({ status: 'unauthenticated' }) }

/**
 * The provider for a configuration. The development identity is chosen only when the configuration says it may serve,
 * which it does only for an explicit `NODE_ENV` of `development` or `test`; in every other case, a missing variable
 * and `production` included, the provider refuses everyone, so a mistake in the environment fails closed.
 */
export function authProviderFor(
  { devIdentity }: Pick<Config, 'devIdentity'>,
  database: Kysely<Database>,
): AuthProvider {
  return devIdentity ? createDevIdentity(database) : nobody
}
