import { createHash, randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { Database } from '../../db/tables.ts'

const minute = 60_000
const day = 24 * 60 * minute

/**
 * When a session ends. Two rules, because each covers what the other cannot (OWASP's session management guidance asks
 * for both): a session that is left behind (a shared computer, a stolen cookie that is never used) ends after a week
 * without use, and one that is used all the time still ends after a month, so a stolen token has a bound however it is
 * kept alive. `touchIntervalMs` is how often use is written down: a request inside it does not write, so reading a page
 * does not become writing a row, and the idle window is known to within five minutes of a week. ADR 0004 gives the reasons.
 */
export const sessionPolicy = { lifetimeMs: 30 * day, idleMs: 7 * day, touchIntervalMs: 5 * minute } as const

/** The session a token belongs to: its id (what the collaboration server knows it by) and whose it is. */
export interface ResolvedSession {
  readonly id: string
  readonly userId: string
}

export interface StartedSession {
  readonly id: string
  /** What goes in the cookie. It is not stored: only its hash is. */
  readonly token: string
  readonly expiresAt: Date
  /** The id of the session this one took the place of, if there was one: its connections have to close. */
  readonly replacedId: string | null
}

export interface Sessions {
  /**
   * Starts a session for a person. When the browser already had one (`replacing` is its token), that session ends in the
   * same transaction, whoever it belonged to: a session that was there before a sign-in never survives it, which is what
   * keeps a session id planted in a browser from being the one that is then signed in (session fixation).
   */
  start(userId: string, options?: { readonly replacing?: string }): Promise<StartedSession>
  /** The session behind a token, or `null` for one that was never issued, was ended or has expired. */
  resolve(token: string): Promise<ResolvedSession | null>
  end(id: string): Promise<void>
  /** Removes the sessions that have ended, and says which. */
  expire(): Promise<string[]>
}

export interface SessionsOptions {
  readonly database: Kysely<Database>
  /** The clock, which a test moves. */
  readonly now?: () => Date
}

/**
 * A token is 256 random bits, so a fast hash is enough to keep it from being recovered from the database, and a lookup by
 * the hash needs no comparison that could be timed: the attacker does not choose the bytes that are compared.
 */
const hashOf = (token: string): Buffer => createHash('sha256').update(token).digest()

/** The query of the sweep: what ended by its absolute lifetime or by not being used. Both columns are indexed. */
export const expiredSessions = (database: Kysely<Database>, at: Date) =>
  database
    .deleteFrom('sessions')
    .where((where) =>
      where.or([
        where('expires_at', '<=', at),
        where('last_seen_at', '<=', new Date(at.getTime() - sessionPolicy.idleMs)),
      ]),
    )
    .returning('id')

export function createSessions({ database, now = () => new Date() }: SessionsOptions): Sessions {
  return {
    async start(userId, { replacing } = {}) {
      const token = randomBytes(32).toString('base64url')
      const at = now()
      const expiresAt = new Date(at.getTime() + sessionPolicy.lifetimeMs)
      return database.transaction().execute(async (transaction) => {
        const replaced =
          replacing === undefined
            ? undefined
            : await transaction
                .deleteFrom('sessions')
                .where('token_hash', '=', hashOf(replacing))
                .returning('id')
                .executeTakeFirst()
        const { id } = await transaction
          .insertInto('sessions')
          .values({
            user_id: userId,
            token_hash: hashOf(token),
            expires_at: expiresAt,
            last_seen_at: at,
            created_at: at,
          })
          .returning('id')
          .executeTakeFirstOrThrow()
        return { id, token, expiresAt, replacedId: replaced?.id ?? null }
      })
    },

    async resolve(token) {
      const at = now()
      const session = await database
        .selectFrom('sessions')
        .select(['id', 'user_id', 'last_seen_at'])
        .where('token_hash', '=', hashOf(token))
        .where('expires_at', '>', at)
        .where('last_seen_at', '>', new Date(at.getTime() - sessionPolicy.idleMs))
        .executeTakeFirst()
      if (session === undefined) return null

      const dueBefore = new Date(at.getTime() - sessionPolicy.touchIntervalMs)
      if (session.last_seen_at <= dueBefore) {
        // The condition is repeated in the statement: two requests that arrive together both see it due, and one writes.
        await database
          .updateTable('sessions')
          .set({ last_seen_at: at })
          .where('id', '=', session.id)
          .where('last_seen_at', '<=', dueBefore)
          .execute()
      }
      return { id: session.id, userId: session.user_id }
    },

    async end(id) {
      await database.deleteFrom('sessions').where('id', '=', id).execute()
    },

    async expire() {
      return (await expiredSessions(database, now()).execute()).map(({ id }) => id)
    },
  }
}
