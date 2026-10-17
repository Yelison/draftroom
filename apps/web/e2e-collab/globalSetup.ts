import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { environment, repositoryRoot } from './environment.ts'
import { serverEnvironment } from './serverProcess.ts'
import { waitFor } from './waitFor.ts'

/**
 * Brings the database to what the tests start from: reachable, migrated and holding the demo workspaces. Both commands
 * are the server's own and do nothing the second time, so a run can follow another on the same database. PostgreSQL itself
 * is started before the run (`docker compose up --wait postgres`, or the service container of CI).
 */
export default async function globalSetup(): Promise<void> {
  await waitFor([`tcp://127.0.0.1:${environment.ports.database}`])
  const serverDirectory = resolve(repositoryRoot, 'apps/server')
  for (const script of ['src/db/run-migrations.ts', 'src/db/demo-seed/run.ts']) {
    execFileSync(process.execPath, [script], { cwd: serverDirectory, env: serverEnvironment(), stdio: 'inherit' })
  }
  // A new log for each run: the server process of the suite appends to it, restarts included.
  mkdirSync(dirname(environment.serverLog), { recursive: true })
  writeFileSync(environment.serverLog, '')
}
