import collaborationSetup from '../../apps/web/e2e-collab/globalSetup.ts'
import { ServerProcess } from '../../apps/web/e2e-collab/serverProcess.ts'

/**
 * What the tour starts from: the migrated, seeded database and the server of the stack, which the suite of the real stack
 * prepares in the same way. The returned function stops the server once the tour is over.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  await collaborationSetup()
  const server = new ServerProcess()
  await server.start()
  return () => server.stop('SIGTERM')
}
