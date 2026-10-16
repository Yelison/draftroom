import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '../../src/db/tables.ts'

/**
 * How long a test waits for requests to queue behind a lock: the bound of a failure, not a pause. It has to stay below the
 * time a test is given (`access.concurrency.test.ts` sets 15 s), so that a request that never queues fails with its own
 * message and not with the test's timeout.
 */
const queueWaitLimitMs = 10_000

/** How many backends of this database are waiting for a lock held by `pid`. */
async function waitingFor(db: Kysely<Database>, pid: number): Promise<number> {
  const { rows } = await sql<{ waiting: number }>`
    select count(*)::int as waiting from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))`.execute(db)
  return rows[0]?.waiting ?? 0
}

/**
 * Sends requests while a transaction holds something on the database, and lets it go once the requests have queued
 * behind it: the only way to make requests overlap on purpose. What they do next is decided by the statement that writes,
 * not by the check each of them made before.
 *
 * With `waitUntilBlocked` the release is not a matter of time: the transaction says which backend it is, and is released
 * when that many backends are waiting for it, so a request that is slow to arrive (a loaded machine) is waited for and
 * cannot find the change already committed. A request that never queues fails the test after a bound.
 */
export async function whileHeld<T>(
  db: Kysely<Database>,
  hold: (trx: Transaction<Database>) => Promise<unknown>,
  send: () => Promise<T>[],
  { waitUntilBlocked = false }: { waitUntilBlocked?: boolean } = {},
): Promise<T[]> {
  let answers: Promise<T[]> = Promise.resolve([])
  await db.transaction().execute(async (trx) => {
    await hold(trx)
    const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx)
    const pid = rows[0]?.pid
    const sent = send()
    answers = Promise.all(sent)
    if (!waitUntilBlocked || pid === undefined) return void (await new Promise((resolve) => setTimeout(resolve, 300)))
    const deadline = Date.now() + queueWaitLimitMs
    while ((await waitingFor(db, pid)) < sent.length) {
      if (Date.now() > deadline)
        throw new Error(`Fewer than ${sent.length} requests queued behind the held transaction`)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  })
  return answers
}

/**
 * Runs requests that are expected to wait for each other, and says whether some backend of the database was seen waiting
 * for a lock while they ran. A change that does not take the lock it should is then a failure of the test, and not a
 * pass because the requests happened not to overlap.
 */
export async function observingLockWaits<T>(
  db: Kysely<Database>,
  run: () => Promise<T>,
): Promise<{ result: T; sawWaiting: boolean }> {
  let sawWaiting = false
  let running = true
  const poll = (async () => {
    while (running) {
      const { rows } = await sql<{ waiting: number }>`
        select count(*)::int as waiting from pg_stat_activity
        where datname = current_database() and cardinality(pg_blocking_pids(pid)) > 0`.execute(db)
      if ((rows[0]?.waiting ?? 0) > 0) sawWaiting = true
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  })()
  try {
    return { result: await run(), sawWaiting }
  } finally {
    running = false
    await poll
  }
}

/** Holds a lock on a row, so the requests that write it queue up behind each other. */
export const whileRowIsLocked = <T>(
  db: Kysely<Database>,
  row: { table: 'documents' | 'folders'; id: string },
  send: () => Promise<T>[],
): Promise<T[]> =>
  whileHeld(db, (trx) => sql`select 1 from ${sql.table(row.table)} where id = ${row.id} for update`.execute(trx), send)

/** Deletes a folder in a transaction that is not committed yet: the requests see it, and it is gone when they write. */
export const whileFolderIsBeingDeleted = <T>(
  db: Kysely<Database>,
  folderId: string,
  send: () => Promise<T>[],
): Promise<T[]> => whileHeld(db, (trx) => trx.deleteFrom('folders').where('id', '=', folderId).execute(), send)
