import type { Kysely } from 'kysely'
import type { NodeEnvironment } from '../../config.ts'
import type { Database } from '../../db/tables.ts'
import type { AuthProvider } from './auth-provider.ts'
import { createDevIdentity } from './devIdentity.ts'

/** Until sign-in exists (T7.1) a production server knows nobody, so it serves the health probes and nothing else. */
const nobody: AuthProvider = { authenticate: () => Promise.resolve({ status: 'unauthenticated' }) }

/**
 * The provider for an environment. The development identity is only ever chosen for `development` and `test`; every
 * other value gets a provider that refuses everyone, so a mistake in the environment fails closed.
 */
export function authProviderFor(nodeEnv: NodeEnvironment, database: Kysely<Database>): AuthProvider {
  return nodeEnv === 'development' || nodeEnv === 'test' ? createDevIdentity(database) : nobody
}
