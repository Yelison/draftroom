import type { Schema } from '@draftroom/contract'
import { sql } from 'kysely'
import type { FastifyPluginCallback, FastifyReply } from 'fastify'
import { giveOwnWorkspaceUnlessMember } from '../../db/workspaces.ts'
import { principalOf } from '../auth/authenticate.ts'
import { cookiesOf, sessionCookieName, type SessionCookies } from '../auth/cookies.ts'
import { createPasswords, type Passwords } from '../auth/passwords.ts'
import { createAttemptLimits, defaultRateLimits, type RateLimits } from '../auth/rateLimit.ts'
import type { Sessions } from '../auth/sessions.ts'
import { operationRoute } from '../operation-route.ts'
import { ProblemError } from '../problem.ts'
import type { RouteDependencies } from './dependencies.ts'

export interface AuthRouteDependencies extends RouteDependencies {
  readonly sessions: Sessions
  readonly sessionCookies: SessionCookies
  readonly passwords?: Passwords
  readonly rateLimits?: RateLimits
}

const uniqueViolation = '23505'
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === uniqueViolation

/** A `429` of the contract, which says when to try again. */
function rateLimited(reply: FastifyReply, seconds: number): ProblemError {
  reply.header('retry-after', seconds)
  return new ProblemError('rate-limited')
}

export const authRoutes: FastifyPluginCallback<AuthRouteDependencies> = (
  app,
  {
    contract,
    database,
    sessions,
    sessionCookies,
    liveAccess,
    passwords = createPasswords(),
    rateLimits = defaultRateLimits,
  },
  done,
) => {
  const limits = createAttemptLimits(app, rateLimits)

  /**
   * Starts the session of a person in the browser that asked, in place of the one it had, and closes the connections of
   * that one once it is gone. Whoever calls this has just proved who the person is.
   */
  async function startSession(
    request: { headers: { cookie?: string | undefined } },
    reply: FastifyReply,
    userId: string,
  ): Promise<void> {
    const replacing = cookiesOf(request.headers.cookie)[sessionCookieName]
    const session = await sessions.start(userId, replacing === undefined || replacing === '' ? {} : { replacing })
    sessionCookies.issue(reply, session)
    if (session.replacedId !== null) await liveAccess.sessionEnded(session.replacedId)
  }

  app.route(
    operationRoute(contract, 'signUp', async (request, reply): Promise<Schema<'User'>> => {
      const { email, password, name } = request.body
      const wait = await limits.signUpBlockedFor(request)
      if (wait !== null) throw rateLimited(reply, wait)

      const passwordHash = await passwords.hash(password)
      let userId: string
      try {
        userId = await database.transaction().execute(async (transaction) => {
          // The row an invitation made, if there is one: signing up claims it, with its memberships and grants.
          const existing = await transaction
            .selectFrom('users')
            .select(['id', 'signed_up_at'])
            .where(sql<boolean>`lower(email) = lower(${email})`)
            .forUpdate()
            .executeTakeFirst()
          if (existing?.signed_up_at != null) throw new ProblemError('conflict')
          if (existing !== undefined) {
            await transaction
              .updateTable('users')
              .set({ name, password_hash: passwordHash, signed_up_at: new Date() })
              .where('id', '=', existing.id)
              .execute()
            await giveOwnWorkspaceUnlessMember(transaction, existing.id, name)
            return existing.id
          }
          const created = await transaction
            .insertInto('users')
            .values({ email, name, password_hash: passwordHash, signed_up_at: new Date() })
            .returning('id')
            .executeTakeFirstOrThrow()
          await giveOwnWorkspaceUnlessMember(transaction, created.id, name)
          return created.id
        })
      } catch (error) {
        // Two sign-ups for one address at the same moment: the second finds it taken when it writes.
        if (isUniqueViolation(error)) throw new ProblemError('conflict')
        throw error
      }

      await startSession(request, reply, userId)
      const person = await database
        .selectFrom('users')
        .select(['id', 'email', 'name'])
        .where('id', '=', userId)
        .executeTakeFirstOrThrow()
      return reply.code(201).send({ id: person.id, email: person.email, name })
    }),
  )

  app.route(
    operationRoute(contract, 'signIn', async (request, reply): Promise<Schema<'User'>> => {
      const { email, password } = request.body
      const wait = await limits.signInBlockedFor(request)
      if (wait !== null) throw rateLimited(reply, wait)

      const account = await database
        .selectFrom('users')
        .select(['id', 'email', 'name', 'password_hash'])
        .where(sql<boolean>`lower(email) = lower(${email})`)
        .where('signed_up_at', 'is not', null)
        .executeTakeFirst()
      // The check is made for an address with no account too, against a hash that belongs to nobody, so that neither the
      // answer nor the time says which addresses have an account.
      const matched = await passwords.matches(password, account?.password_hash ?? null)
      if (!matched || account?.name == null) {
        await limits.signInFailed(request)
        throw new ProblemError('unauthenticated')
      }

      await startSession(request, reply, account.id)
      return { id: account.id, email: account.email, name: account.name }
    }),
  )

  app.route(
    operationRoute(contract, 'signOut', async (request, reply) => {
      const { sessionId } = principalOf(request)
      // The development identity has no session: there is nothing to end, and the cookies are cleared all the same.
      if (sessionId !== undefined) {
        await sessions.end(sessionId)
        // After the session is gone, so a connection that is being opened at this moment finds it gone too.
        await liveAccess.sessionEnded(sessionId)
      }
      sessionCookies.clear(reply)
      return reply.code(204).send()
    }),
  )

  done()
}
