import { execFile, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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

/**
 * A `docker` that logs its arguments and runs `hook` first, a shell snippet that can end the call or change what it does, and
 * otherwise runs the real one: the way to see what the scripts ask Docker for and to make one step of them fail.
 */
function dockerShim(hook = ''): { readonly path: string; readonly log: string; readonly directory: string } {
  const directory = mkdtempSync(join(workDirectory, 'shim-'))
  const bin = join(directory, 'bin')
  const log = join(directory, 'docker-arguments.log')
  mkdirSync(bin)
  const real = execFileSync('which', ['docker']).toString().trim()
  writeFileSync(join(bin, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\n${hook}\nexec '${real}' "$@"\n`)
  chmodSync(join(bin, 'docker'), 0o755)
  return { path: `${bin}:${process.env['PATH'] ?? ''}`, log, directory }
}

/** A table big enough that the data is most of an archive of it, and the table of contents at the start a small part. */
async function populateBig(name: string): Promise<void> {
  await query('postgres', `create database "${name}"`)
  await query(name, 'create table notes (id int primary key, body text not null)')
  await query(
    name,
    `insert into notes select n, md5(random()::text) || md5(random()::text) from generate_series(1, 20000) as n`,
  )
}

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
  await populateBig('big_source')
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
    const shim = dockerShim()
    const secret = `s3cret-${randomUUID()}`

    const outcome = await run('backup.sh', [join(shim.directory, 'out')], {
      PATH: shim.path,
      POSTGRES_PASSWORD: secret,
      PGPASSWORD: secret,
    })

    expect(outcome.code, outcome.stderr).toBe(0)
    expect(readFileSync(shim.log, 'utf8')).toContain('pg_dump')
    expect(readFileSync(shim.log, 'utf8')).not.toContain(secret)
  })

  it('does not keep a dump that is cut short on its way to the file, although its table of contents reads', async () => {
    // `head -c` ends the dump half way, as a full disk or a dropped connection would.
    const shim = dockerShim(
      `case "$*" in *pg_dump*) '${execFileSync('which', ['docker']).toString().trim()}' "$@" | head -c 200000; exit 0 ;; esac`,
    )
    const output = join(shim.directory, 'out')

    const outcome = await run('backup.sh', [output], { PATH: shim.path, POSTGRES_DB: 'big_source' })

    expect(outcome.code).not.toBe(0)
    expect(outcome.stderr).toContain('cannot be read back')
    expect(readdirSync(output)).toEqual([])
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

  describe('with an archive that a cut transfer left without the end of its data', () => {
    let truncated: string
    beforeAll(async () => {
      const whole = await run('backup.sh', [workDirectory], { POSTGRES_DB: 'big_source' })
      expect(whole.code, whole.stderr).toBe(0)
      const bytes = readFileSync(whole.stdout.trim())
      truncated = join(workDirectory, 'cut-short.dump')
      writeFileSync(truncated, bytes.subarray(0, Math.floor(bytes.length / 2)))
    })

    it('leaves the database it was told to overwrite with its rows, even with --yes', async () => {
      await populate('survivor', 'written before the transfer was cut')

      const outcome = await run('restore.sh', ['--yes', truncated, 'survivor'])

      expect(outcome.code).not.toBe(0)
      expect(outcome.stderr).toContain('not a complete, readable backup')
      expect((await notes('survivor')).map((note) => note.body)).toEqual(['written before the transfer was cut'])
    })

    it('refuses a backup that was cut short when it was written', async () => {
      const outcome = await run('restore.sh', [truncated, 'never_created'])

      expect(outcome.code).not.toBe(0)
      expect(await databaseExists('never_created')).toBe(false)
    })
  })

  it('keeps the database it was told to overwrite, and drops its scratch copy, when the restore itself fails', async () => {
    await populate('survives_failure', 'written before the restore failed')
    // The whole archive reads, so every check passes, and the restore into the scratch database is what fails.
    const shim = dockerShim(
      `case "$*" in *--single-transaction*) cat >/dev/null; echo 'injected failure' >&2; exit 1 ;; esac`,
    )

    const outcome = await run('restore.sh', ['--yes', archive, 'survives_failure'], { PATH: shim.path })

    expect(outcome.code).not.toBe(0)
    expect(outcome.stderr).toContain("'survives_failure' was not touched")
    expect((await notes('survives_failure')).map((note) => note.body)).toEqual(['written before the restore failed'])
    expect(await query('postgres', `select datname from pg_database where datname like 'restore\\_%'`)).toEqual([])
  })

  it('leaves no scratch or previous database behind after replacing one', async () => {
    await populate('replaced_clean', 'about to be replaced')

    const outcome = await run('restore.sh', ['--yes', archive, 'replaced_clean'])

    expect(outcome.code, outcome.stderr).toBe(0)
    expect(await query('postgres', `select datname from pg_database where datname like 'restore\\_%'`)).toEqual([])
  })

  const refusals: ReadonlyArray<readonly [what: string, args: () => string[], message: string]> = [
    [
      'a file that is not a backup',
      () => [join(workDirectory, 'not-a-backup.dump'), 'refused_target'],
      'not a complete, readable backup',
    ],
    ['a file that is not there', () => [join(workDirectory, 'missing.dump'), 'refused_target'], 'is not a file'],
    [
      'a target that is not a plain name',
      () => [archive, 'x"; drop database draftroom; --'],
      'not a plain database name',
    ],
    ['no target at all', () => [archive], 'usage:'],
    ['postgres as the target', () => [archive, 'postgres'], 'database of PostgreSQL itself'],
    ['template0 as the target', () => [archive, 'template0'], 'database of PostgreSQL itself'],
    ['template1 as the target', () => [archive, 'template1'], 'database of PostgreSQL itself'],
  ]
  it.each(refusals)('refuses %s and creates nothing', async (_what, args, message) => {
    writeFileSync(join(workDirectory, 'not-a-backup.dump'), 'just some text')

    const outcome = await run('restore.sh', args())

    expect(outcome.code).not.toBe(0)
    expect(outcome.stderr).toContain(message)
    expect(await databaseExists('refused_target')).toBe(false)
  })
})
