import type { FastifyRequest } from 'fastify'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../../db/tables.ts'
import type { AuthProvider, Authentication } from './auth-provider.ts'

/** The header that names the caller while there is no sign-in: the email of a person who has signed up. */
export const devUserHeader = 'x-dev-user'

const maxEmailLength = 254

/**
 * Identifies the caller by the `X-Dev-User` header, for local development and the tests. Anyone who can send a header
 * can be anyone, so this provider must never serve production: `authProviderFor` is the only place that chooses it,
 * and it does so from the environment's `NODE_ENV`.
 *
 * Only a person who has signed up counts. A member who was added by email and has not signed up yet has no name, and
 * is not a person who can be calling. There is no CSRF check: a custom header cannot be sent by another origin without
 * a preflight that the server never grants, so it carries none of the risk the check exists for. The cookie session of
 * T7.1 brings the real one.
 */
export function createDevIdentity(database: Kysely<Database>): AuthProvider {
  return {
    async authenticate(request: FastifyRequest): Promise<Authentication> {
      const email = request.headers[devUserHeader]
      // A repeated header arrives as a list, and a value that cannot be an email needs no query.
      if (typeof email !== 'string' || email === '' || email.length > maxEmailLength) {
        return { status: 'unauthenticated' }
      }
      const person = await database
        .selectFrom('users')
        .select('id')
        .where(sql<boolean>`lower(email) = lower(${email})`)
        .where('signed_up_at', 'is not', null)
        .executeTakeFirst()
      return person === undefined
        ? { status: 'unauthenticated' }
        : { status: 'authenticated', principal: { userId: person.id } }
    },
  }
}
