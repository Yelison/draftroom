import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { postgresImage, urlOfDatabase } from '../support/postgres.ts'

// scripts/backup.sh and scripts/restore.sh against a real PostgreSQL 17, the way they run on the production host: from
// outside the container, which they reach through Docker.

const scripts = new URL('../../../../scripts/', import.meta.url).pathname
const user = 'draftroom'
const password = randomUUID()

let container: StartedPostgreSqlContainer
let workDirectory: string
beforeAll(async () => {
  container = await new PostgreSqlContainer(postgresImage())
    .withUsername(user)
    .withPassword(password)
    .withDatabase('draftroom')
    .start()
  workDirectory = mkdtempSync(join(tmpdir(), 'draftroom-backup-test-'))
}, 120_000)
afterAll(async () => {
  await container.stop()
  rmSync(workDirectory, { recursive: true, force: true })
})

interface Outcome {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/** Runs a script as the host does, and reports how it ended instead of throwing: refusals are what is tested too. */
function run(script: string, args: readonly string[], environment: Record<string, string> = {}): Promise<Outcome> {
  return new Promise((resolve) => {
    execFile(
      'bash',
      [join(scripts, script), ...args],
      {
        env: {
          PATH: process.env['PATH'] ?? '',
          POSTGRES_CONTAINER: container.getId(),
          POSTGRES_USER: user,
          ...environment,
        },
      },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1
        resolve({ code, stdout, stderr })
      },
    )
  })
}

async function query<Row extends pg.QueryResultRow>(database: string, text: string): Promise<Row[]> {
  const client = new pg.Client({ connectionString: urlOfDatabase(container.getConnectionUri(), database) })
  await client.connect()
  try {
    return (await client.query<Row>(text)).rows
  } finally {
    await client.end()
  }
}

const databaseExists = async (name: string) =>
  (await query('postgres', `select 1 from pg_database where datname = '${name}'`)).length === 1

const documentState = Buffer.from([0, 1, 2, 253, 254, 255])

/** A database with a table and the bytes of a document in it: what a backup has to bring back exactly. */
async function populate(name: string, body: string): Promise<void> {
  if (!(await databaseExists(name))) await query('postgres', `create database "${name}"`)
  await query(name, `create table notes (id int primary key, body text not null, state bytea not null)`)
  await query(name, `insert into notes values (1, '${body}', '\\x${documentState.toString('hex')}')`)
}

const notes = (name: string) =>
  query<{ id: number; body: string; state: Buffer }>(name, 'select * from notes order by id')

/** A backup of `draftroom` as it is now. */
async function backUp(): Promise<string> {
  const outcome = await run('backup.sh', [workDirectory])
  expect(outcome.code, outcome.stderr).toBe(0)
  return outcome.stdout.trim()
}

// The one backup of the database as it is first, taken once: two in the same second would share a name, and the script
// never overwrites a backup.
let archive: string
beforeAll(async () => {
  await populate('draftroom', 'the minutes of the board')
  archive = await backUp()
})

describe('backup.sh', () => {
  it('writes one archive, named for the database and the moment, and prints its path', () => {
    expect(archive).toMatch(/\/draftroom-draftroom-\d{8}T\d{6}Z\.dump$/)
    expect(archive.startsWith(workDirectory)).toBe(true)
  })

  it('leaves nothing half written beside it, and makes it readable by its owner only', () => {
    expect(readdirSync(workDirectory).filter((name) => name.endsWith('.partial'))).toEqual([])
    expect(statSync(archive).mode & 0o777).toBe(0o600)
  })

  it('writes a PostgreSQL custom-format archive', () => {
    expect(readFileSync(archive).subarray(0, 5).toString('latin1')).toBe('PGDMP')
  })

  it('refuses to name a database that is not a plain name, before it touches anything', async () => {
    const outcome = await run('backup.sh', [workDirectory], { POSTGRES_DB: 'draftroom"; drop database draftroom; --' })

    expect(outcome.code).not.toBe(0)
    expect(outcome.stderr).toContain('not a plain database name')
  })

  it('does not stop at a database that does not exist, and leaves no file for it', async () => {
    const before = readdirSync(workDirectory)

    const outcome = await run('backup.sh', [workDirectory], { POSTGRES_DB: 'no_such_database' })

    expect(outcome.code).not.toBe(0)
    expect(readdirSync(workDirectory)).toEqual(before)
  })

  it('never puts a password on a command line, where `ps` would show it', async () => {
    const shim = join(workDirectory, 'shim')
    const log = join(workDirectory, 'docker-arguments.log')
    const realDocker = (await import('node:child_process')).execFileSync('which', ['docker']).toString().trim()
    rmSync(shim, { recursive: true, force: true })
    mkdtempSync(join(workDirectory, 'unused-'))
    const { mkdirSync } = await import('node:fs')
    mkdirSync(shim)
    writeFileSync(join(shim, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexec '${realDocker}' "$@"\n`)
    chmodSync(join(shim, 'docker'), 0o755)
    const secret = `s3cret-${randomUUID()}`

    const outcome = await run('backup.sh', [workDirectory], {
      PATH: `${shim}:${process.env['PATH'] ?? ''}`,
      POSTGRES_PASSWORD: secret,
      PGPASSWORD: secret,
    })

    expect(outcome.code, outcome.stderr).toBe(0)
    expect(readFileSync(log, 'utf8')).toContain('pg_dump')
    expect(readFileSync(log, 'utf8')).not.toContain(secret)
  })
})

describe('restore.sh', () => {
  it('creates the database it is told to restore into, with the content of the backup, byte for byte', async () => {
    const outcome = await run('restore.sh', [archive, 'restored_copy'])

    expect(outcome.code, outcome.stderr).toBe(0)
    expect(await notes('restored_copy')).toEqual([{ id: 1, body: 'the minutes of the board', state: documentState }])
  })

  it('refuses to overwrite a database that holds data unless it is told to, and leaves it as it was', async () => {
    await populate('already_in_use', 'written after the backup')

    const outcome = await run('restore.sh', [archive, 'already_in_use'])

    expect(outcome.code).not.toBe(0)
    expect(outcome.stderr).toContain('pass --yes')
    expect((await notes('already_in_use')).map((note) => note.body)).toEqual(['written after the backup'])
  })

  it('overwrites it when told to, and what was there is gone', async () => {
    await query('already_in_use', 'create table written_later (id int)')

    const outcome = await run('restore.sh', ['--yes', archive, 'already_in_use'])

    expect(outcome.code, outcome.stderr).toBe(0)
    expect((await notes('already_in_use')).map((note) => note.body)).toEqual(['the minutes of the board'])
    expect(await query('already_in_use', `select to_regclass('written_later') as found`)).toEqual([{ found: null }])
  })

  it('does not drop a database somebody is connected to', async () => {
    const connected = new pg.Client({ connectionString: urlOfDatabase(container.getConnectionUri(), 'already_in_use') })
    await connected.connect()
    try {
      const outcome = await run('restore.sh', ['--yes', archive, 'already_in_use'])

      expect(outcome.code).not.toBe(0)
      expect(outcome.stderr).toContain('is in use')
    } finally {
      await connected.end()
    }
    // PostgreSQL waits five seconds for the other connections to go before it refuses to drop the database.
  }, 20_000)

  const refusals: ReadonlyArray<readonly [what: string, args: () => string[], message: string]> = [
    [
      'a file that is not a backup',
      () => [join(workDirectory, 'not-a-backup.dump'), 'refused_target'],
      'not a readable backup',
    ],
    ['a file that is not there', () => [join(workDirectory, 'missing.dump'), 'refused_target'], 'is not a file'],
    [
      'a target that is not a plain name',
      () => [archive, 'x"; drop database draftroom; --'],
      'not a plain database name',
    ],
    ['no target at all', () => [archive], 'usage:'],
  ]
  it.each(refusals)('refuses %s and creates nothing', async (_what, args, message) => {
    writeFileSync(join(workDirectory, 'not-a-backup.dump'), 'just some text')

    const outcome = await run('restore.sh', args())

    expect(outcome.code).not.toBe(0)
    expect(outcome.stderr).toContain(message)
    expect(await databaseExists('refused_target')).toBe(false)
  })
})
