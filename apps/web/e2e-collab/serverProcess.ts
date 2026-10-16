import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { environment, repositoryRoot } from './environment.ts'
import { waitFor } from './waitFor.ts'

const { apiOrigin, appOrigin, databaseUrl, ports, serverLog } = environment

/** The environment the server is started with: the settings of the stack and nothing else of this machine's. */
export const serverEnvironment = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  API_PORT: String(ports.api),
  COLLAB_PORT: String(ports.collaboration),
  // A browser always sends its origin with the upgrade, and the app's is the one the proxy of the suite serves.
  ALLOWED_ORIGINS: appOrigin,
})

/**
 * The server of the stack as a process of its own, which the tests stop and start: the durability of what a person was
 * told is "Synced" can only be shown by taking the server away. Its output goes to a file that CI keeps when a test fails.
 */
export class ServerProcess {
  private child: ChildProcess | undefined

  get running(): boolean {
    return this.child !== undefined
  }

  async start(): Promise<void> {
    if (this.child !== undefined) throw new Error('The server is already running')
    mkdirSync(dirname(serverLog), { recursive: true })
    const log = openSync(serverLog, 'a')
    const child = spawn(process.execPath, ['src/main.ts'], {
      cwd: resolve(repositoryRoot, 'apps/server'),
      env: serverEnvironment(),
      stdio: ['ignore', log, log],
    })
    // The child holds its own descriptor of the file now.
    closeSync(log)
    this.child = child
    child.once('exit', () => {
      if (this.child === child) this.child = undefined
    })
    await waitFor([`tcp://127.0.0.1:${ports.collaboration}`, `${apiOrigin}/api/health/ready`])
  }

  /**
   * Ends the process and waits until it is gone, so the ports are free for the next start. `SIGKILL` gives it no time to
   * store what it holds in memory, which is how a test shows that "Synced" was said only for what was already stored.
   */
  async stop(signal: 'SIGTERM' | 'SIGKILL' = 'SIGKILL'): Promise<void> {
    const { child } = this
    if (child === undefined) return
    const exited = new Promise<void>((done) => child.once('exit', () => done()))
    child.kill(signal)
    await exited
  }

  async restart(signal: 'SIGTERM' | 'SIGKILL' = 'SIGKILL'): Promise<void> {
    await this.stop(signal)
    await this.start()
  }
}
