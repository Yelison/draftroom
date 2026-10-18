import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrations } from '../src/db/migrations/index.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'

// The deployed image migrates before it serves (`node src/db/run-migrations.ts && node src/main.ts`), so two instances
// that start together both run the migration command on a database that may still be empty.

const migrationCommand = new URL('../src/db/run-migrations.ts', import.meta.url).pathname
const holdUntilGate = new URL('./support/start-together.ts', import.meta.url).pathname

let database: TestDatabase
beforeAll(async () => {
  database = await provisionDatabase({ migrated: false })
})
afterAll(() => database.drop())

interface Outcome {
  readonly code: number | null
  readonly output: string
}

/** Starts `count` migration processes, releases them all at once and resolves when every one has exited. */
async function migrateTogether(count: number): Promise<Outcome[]> {
  const directory = mkdtempSync(join(tmpdir(), 'draftroom-start-'))
  const gate = join(directory, 'gate')
  try {
    const exits = Array.from({ length: count }, () => {
      const child = spawn(process.execPath, ['--import', holdUntilGate, migrationCommand], {
        env: { PATH: process.env['PATH'] ?? '', DATABASE_URL: database.url, START_GATE: gate },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
      child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
      return new Promise<Outcome>((resolve) => child.on('exit', (code) => resolve({ code, output })))
    })
    while (readdirSync(directory).length < count) await sleep(5)
    writeFileSync(gate, '')
    return await Promise.all(exits)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('two instances that start at the same moment on an empty database', () => {
  it('migrate it once between them, and both go on to serve', async () => {
    const outcomes = await migrateTogether(2)

    expect(outcomes.map((outcome) => outcome.code)).toEqual([0, 0])
    const { rows } = await sql<{ name: string }>`select name from kysely_migration order by name`.execute(database.db)
    expect(rows.map((row) => row.name)).toEqual(Object.keys(migrations).sort())
    // One of them did the work; the other waited for it and found nothing left to do.
    expect(outcomes.filter((outcome) => outcome.output.startsWith('Applied: 0001_initial')).length).toBe(1)
    expect(outcomes.filter((outcome) => outcome.output.startsWith('The database is up to date.')).length).toBe(1)
  }, 30_000)
})
