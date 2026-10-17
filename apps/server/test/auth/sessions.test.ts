import { createHash } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/tables.ts'
import { createSessions, expiredSessions, sessionPolicy, type Sessions } from '../../src/http/auth/sessions.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createPerson, type Person } from '../support/world.ts'

// The store of sessions: what is kept of a token, when a session ends, and how little it writes to know that it is used.

const minute = 60_000
const day = 24 * 60 * minute

let database: TestDatabase
let db: Kysely<Database>
let marta: Person
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
  marta = await createPerson(db, 'Marta Ruiz')
})
afterAll(async () => {
  await database.drop()
})

/** A store whose clock the test moves, so a session can be a week old without waiting for it. */
function sessionsAt(start = new Date()): { sessions: Sessions; moveTo(instant: Date): void } {
  let current = start
  return {
    sessions: createSessions({ database: db, now: () => current }),
    moveTo: (instant) => void (current = instant),
  }
}

const lastSeen = async (id: string) =>
  (await db.selectFrom('sessions').select('last_seen_at').where('id', '=', id).executeTakeFirstOrThrow()).last_seen_at

describe('what is kept of a session token', () => {
  it('is a hash: the token itself is nowhere in the database', async () => {
    const { sessions } = sessionsAt()

    const { token, id } = await sessions.start(marta.id)

    const row = await db.selectFrom('sessions').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(Buffer.from(row.token_hash)).toEqual(createHash('sha256').update(token).digest())
    expect(JSON.stringify(row)).not.toContain(token)
  })

  it('has 256 bits, and is a different one every time', async () => {
    const { sessions } = sessionsAt()

    const tokens = await Promise.all([sessions.start(marta.id), sessions.start(marta.id)])

    expect(tokens.map(({ token }) => Buffer.from(token, 'base64url').length)).toEqual([32, 32])
    expect(tokens[0]?.token).not.toBe(tokens[1]?.token)
  })
})

describe('finding the session of a token', () => {
  it('gives who it belongs to and the id the collaboration server knows it by', async () => {
    const { sessions } = sessionsAt()
    const { token, id } = await sessions.start(marta.id)

    expect(await sessions.resolve(token)).toEqual({ id, userId: marta.id })
  })

  it('finds nothing for a token that is not in the database', async () => {
    const { sessions } = sessionsAt()

    expect(await sessions.resolve('a-token-that-was-never-issued')).toBeNull()
  })

  it('finds nothing for a session that was ended', async () => {
    const { sessions } = sessionsAt()
    const { token, id } = await sessions.start(marta.id)

    await sessions.end(id)

    expect(await sessions.resolve(token)).toBeNull()
  })
})

describe('a session that is not used', () => {
  it('lasts up to the idle window and ends at it', async () => {
    const start = new Date()
    const { sessions, moveTo } = sessionsAt(start)
    const { token } = await sessions.start(marta.id)

    moveTo(new Date(start.getTime() + sessionPolicy.idleMs - minute))
    expect(await sessions.resolve(token)).not.toBeNull()
  })

  it('is over once the idle window has passed since it was last used', async () => {
    const start = new Date()
    const { sessions, moveTo } = sessionsAt(start)
    const { token } = await sessions.start(marta.id)

    moveTo(new Date(start.getTime() + sessionPolicy.idleMs + minute))

    expect(await sessions.resolve(token)).toBeNull()
  })

  it('is kept alive by use, until its absolute lifetime ends it whatever it is used', async () => {
    const start = new Date()
    const { sessions, moveTo } = sessionsAt(start)
    const { token } = await sessions.start(marta.id)

    // Used every five days, which is inside the idle window, for as long as the lifetime lasts.
    for (let elapsed = 5 * day; elapsed < sessionPolicy.lifetimeMs; elapsed += 5 * day) {
      moveTo(new Date(start.getTime() + elapsed))
      expect(await sessions.resolve(token)).not.toBeNull()
    }
    moveTo(new Date(start.getTime() + sessionPolicy.lifetimeMs + minute))

    expect(await sessions.resolve(token)).toBeNull()
  })
})

describe('knowing that a session is used', () => {
  it('writes when the last time is older than the interval, and not again for the requests that follow', async () => {
    const start = new Date()
    const { sessions, moveTo } = sessionsAt(start)
    const { token, id } = await sessions.start(marta.id)

    moveTo(new Date(start.getTime() + sessionPolicy.touchIntervalMs + minute))
    await sessions.resolve(token)
    const afterFirst = await lastSeen(id)
    moveTo(new Date(start.getTime() + sessionPolicy.touchIntervalMs + 2 * minute))
    await sessions.resolve(token)
    await sessions.resolve(token)

    expect(afterFirst.getTime()).toBe(start.getTime() + sessionPolicy.touchIntervalMs + minute)
    expect(await lastSeen(id)).toEqual(afterFirst)
  })

  it('does not write for a request inside the interval', async () => {
    const start = new Date()
    const { sessions, moveTo } = sessionsAt(start)
    const { token, id } = await sessions.start(marta.id)
    const first = await lastSeen(id)

    moveTo(new Date(start.getTime() + sessionPolicy.touchIntervalMs - minute))
    await sessions.resolve(token)

    expect(await lastSeen(id)).toEqual(first)
  })
})

describe('starting a session in place of another', () => {
  it('ends the one that was there, so only the new token works', async () => {
    const { sessions } = sessionsAt()
    const before = await sessions.start(marta.id)

    const after = await sessions.start(marta.id, { replacing: before.token })

    expect(after.replacedId).toBe(before.id)
    expect(await sessions.resolve(before.token)).toBeNull()
    expect(await sessions.resolve(after.token)).not.toBeNull()
  })

  it('ends the one that was there even when it was another person’s, and says nothing when there was none', async () => {
    const { sessions } = sessionsAt()
    const eli = await createPerson(db, 'Eli Vega')
    const eliSession = await sessions.start(eli.id)

    const marta1 = await sessions.start(marta.id, { replacing: eliSession.token })
    const nothingToReplace = await sessions.start(marta.id, { replacing: 'never-issued' })

    expect(marta1.replacedId).toBe(eliSession.id)
    expect(nothingToReplace.replacedId).toBeNull()
  })
})

describe('the sweep of sessions that ended', () => {
  it('removes the idle and the expired and says which, and leaves the rest', async () => {
    const start = new Date()
    const { sessions, moveTo } = sessionsAt(start)
    const [idle, active, expired, lasting] = await Promise.all([1, 2, 3, 4].map(() => sessions.start(marta.id)))
    if (!idle || !active || !expired || !lasting) throw new Error('four sessions were started')
    const at = (days: number) => new Date(start.getTime() + days * day)
    // `idle` stays as it was started. The others were used on day five, so none is idle on day seven; two of them have
    // an absolute end that has passed by then.
    await sql`update sessions set last_seen_at = ${at(5)} where id in (${active.id}, ${expired.id}, ${lasting.id})`.execute(
      db,
    )
    await sql`update sessions set expires_at = ${at(4)} where id = ${active.id}`.execute(db)
    await sql`update sessions set expires_at = ${at(2)} where id = ${expired.id}`.execute(db)

    moveTo(new Date(start.getTime() + sessionPolicy.idleMs + minute))
    const removed = await sessions.expire()

    // Other tests of this file left sessions behind that also ended by now, so the list holds at least these three.
    expect(removed).toEqual(expect.arrayContaining([idle.id, expired.id, active.id]))
    expect(removed).not.toContain(lasting.id)
    expect(await sessions.resolve(lasting.token)).not.toBeNull()
  })
})

describe('the query of the sweep', () => {
  it('reads the sessions that ended through the two indexes, not the whole table', async () => {
    const sweepDatabase = await provisionDatabase()
    try {
      const person = await createPerson(sweepDatabase.db, 'Ana Sol')
      await sql`
        insert into sessions (user_id, token_hash, expires_at, last_seen_at, created_at)
        select ${person.id}, decode(md5(n::text) || md5((n + 1)::text), 'hex'),
               now() + interval '20 days', now() - interval '1 hour', now() - interval '2 days'
        from generate_series(1, 20000) as n`.execute(sweepDatabase.db)
      await sql`analyze sessions`.execute(sweepDatabase.db)

      const plan = JSON.stringify(await expiredSessions(sweepDatabase.db, new Date()).explain('json'))

      expect(plan).toContain('sessions_expires_at_idx')
      expect(plan).toContain('sessions_last_seen_at_idx')
      expect(plan).not.toContain('Seq Scan')
    } finally {
      await sweepDatabase.drop()
    }
  })
})
