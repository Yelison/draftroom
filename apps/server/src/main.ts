import { createCollabServer } from './collab/server.ts'
import { ConfigError, loadConfig } from './config.ts'
import { createDatabase } from './db/database.ts'
import { buildApp } from './http/app.ts'
import { authProviderFor } from './http/auth/select.ts'

// The entry point of the server: `npm start`, or `npm run dev` with a watcher. Run by Node itself, with no build step.
// One process, two listeners: REST on `API_PORT` and the collaboration WebSocket on `COLLAB_PORT`.

function readConfig() {
  try {
    return loadConfig()
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    console.error(error.message)
    process.exit(1)
  }
}

const config = readConfig()
const database = createDatabase(config.databaseUrl)
const authProvider = authProviderFor(config, database)
const app = buildApp({ database, authProvider, logger: { level: 'info' } })
const collaboration = createCollabServer({
  config: { ...config, host: config.apiHost },
  database,
  authProvider,
  log: app.log,
})

async function shutDown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'shutting down')
  // The collaboration server first: it stores the documents that are waiting, and that needs the database.
  await collaboration.shutDown()
  await app.close()
  await database.destroy()
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void shutDown(signal))
}

await app.listen({ port: config.apiPort, host: config.apiHost })
await collaboration.listen()
