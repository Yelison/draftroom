import type { Kysely } from 'kysely'
import {
  createCollabServer,
  type CollabConfig,
  type CollabServer,
  type CollabServerOptions,
} from '../../../src/collab/server.ts'
import type { CollabLog } from '../../../src/collab/log.ts'
import type { CollabTiming } from '../../../src/collab/timing.ts'
import type { Database } from '../../../src/db/tables.ts'
import { createDevIdentity } from '../../../src/http/auth/devIdentity.ts'

export interface LogEntry {
  readonly level: 'info' | 'warn' | 'error'
  readonly details: object
  readonly message: string
}

/** A logger that keeps what it was told, for the tests that say "and it logs the document". */
export class RecordingLog implements CollabLog {
  readonly entries: LogEntry[] = []

  info(details: object, message: string): void {
    this.entries.push({ level: 'info', details, message })
  }

  warn(details: object, message: string): void {
    this.entries.push({ level: 'warn', details, message })
  }

  error(details: object, message: string): void {
    this.entries.push({ level: 'error', details, message })
  }
}

/** Waits short enough that a test waits for events and not for the clock; the real values are pinned by a unit test. */
export const fastTiming: CollabTiming = {
  debounceMs: 20,
  maxDebounceMs: 80,
  retryDelaysMs: [15, 30],
  shutdownWaitMs: 3_000,
  shutdownGraceMs: 500,
}

const testConfig: CollabConfig = {
  // The system picks the port, so test files never meet.
  collabPort: 0,
  host: '127.0.0.1',
  allowedOrigins: ['https://app.harborpine.example'],
  devIdentity: true,
  sessionSecret: 'a-secret-that-is-long-enough-for-a-hash',
}

export interface CollabHarness {
  readonly server: CollabServer
  readonly log: RecordingLog
  /** `ws://` URL of the listener. */
  readonly url: string
  /** Shuts the server down as the process does; safe to call after a test already did. */
  close(): Promise<void>
}

export type HarnessOptions = Partial<Omit<CollabServerOptions, 'config' | 'log'>> & {
  readonly config?: Partial<CollabConfig>
}

/** The real collaboration server, on a random port, over a given database. */
export async function startCollab(
  database: Kysely<Database>,
  { config, ...options }: HarnessOptions = {},
): Promise<CollabHarness> {
  const log = new RecordingLog()
  const server = createCollabServer({
    database,
    authProvider: createDevIdentity(database),
    timing: fastTiming,
    ...options,
    config: { ...testConfig, ...config },
    log,
  })
  const port = await server.listen()
  let closed = false
  return {
    server,
    log,
    url: `ws://127.0.0.1:${port}`,
    async close() {
      if (closed) return
      closed = true
      await server.shutDown()
    },
  }
}
