import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { connect } from 'node:net'
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
  // The CSRF tokens are made with it: one that is the same after the server is stopped and started keeps the pages of the
  // tests that do that signed in (their sessions are in the database), which a secret chosen at each start would not.
  SESSION_SECRET: 'the-session-secret-of-the-real-stack-end-to-end-suite',
})

const serverPorts = [ports.api, ports.collaboration]

function acceptsConnections(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

/**
 * The server of the stack as a process of its own, which the tests stop and start: the durability of what a person was
 * told is "Synced" can only be shown by taking the server away. Its output goes to a file that CI keeps when a test fails.
 */
export class ServerProcess {
  private child: ChildProcess | undefined

  /** `overrides` change the environment the server is started with, for a test that needs it to fail to start. */
  constructor(private readonly overrides: NodeJS.ProcessEnv = {}) {}

  get running(): boolean {
    return this.child !== undefined
  }

  async start(): Promise<void> {
    if (this.child !== undefined) throw new Error('The server is already running')
    // Whatever answers on these ports is not this process, and waiting for it would take its answers for this server's: a
    // test that kills "the server" would kill a process that serves nothing and leave the other one answering.
    for (const port of serverPorts) {
      if (await acceptsConnections(port)) {
        throw new Error(
          `Port ${port} already accepts connections: a server of an earlier run is still running. Stop it first.`,
        )
      }
    }
    mkdirSync(dirname(serverLog), { recursive: true })
    const log = openSync(serverLog, 'a')
    const child = spawn(process.execPath, ['src/main.ts'], {
      cwd: resolve(repositoryRoot, 'apps/server'),
      env: { ...serverEnvironment(), ...this.overrides },
      stdio: ['ignore', log, log],
    })
    // The child holds its own descriptor of the file now.
    closeSync(log)
    this.child = child
    child.once('exit', () => {
      if (this.child === child) this.child = undefined
    })
    // A server that dies before it answers (a wrong setting, a port taken between the check and the start) is reported at once
    // and not after the whole wait. Once it has answered this promise is only left unused.
    const diedBeforeAnswering = new Promise<never>((_, reject) => {
      child.once('exit', (code) =>
        reject(new Error(`The server exited with code ${code} before it answered; see ${serverLog}`)),
      )
    })
    diedBeforeAnswering.catch(() => undefined)
    await Promise.race([
      waitFor([`tcp://127.0.0.1:${ports.collaboration}`, `${apiOrigin}/api/health/ready`]),
      diedBeforeAnswering,
    ])
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
