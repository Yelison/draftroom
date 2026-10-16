import globalSetup from '../globalSetup.ts'
import { ServerProcess } from '../serverProcess.ts'

const server = new ServerProcess()

/** The stack of the suite for a run of the contract battery: the database as the end-to-end suite leaves it, and the server. */
export async function setup(): Promise<void> {
  await globalSetup()
  await server.start()
}

export async function teardown(): Promise<void> {
  await server.stop('SIGTERM')
}
