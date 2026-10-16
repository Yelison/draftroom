import { broadcastToDocument } from './collab/broadcastToDocument.ts'
import { createLiveAccess, factsFromDatabase } from './collab/revocation.ts'
import { createCollabServer } from './collab/server.ts'
import { ConfigError, loadConfig } from './config.ts'
import { createDatabase } from './db/database.ts'
import { buildApp } from './http/app.ts'
import { authProviderFor } from './http/auth/select.ts'
import type { DocumentBroadcaster } from './http/document-broadcaster.ts'

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
// The collaboration server logs through the app, and the app tells the connections of a document about a change through
// the collaboration server. The app is built first and the broadcaster reaches the server when a request is served,
// which is always after both exist.
const broadcaster: DocumentBroadcaster = {
  broadcast: (documentId, event) => broadcastToDocument(collaboration.hocuspocus, documentId, event),
}
const app = buildApp({
  database,
  authProvider,
  logger: { level: 'info' },
  broadcaster,
  liveAccess: {
    documentChanged: (documentId) => liveAccess.documentChanged(documentId),
    memberChanged: (workspaceId, userId) => liveAccess.memberChanged(workspaceId, userId),
  },
})
const collaboration = createCollabServer({
  config: { ...config, host: config.apiHost },
  database,
  authProvider,
  log: app.log,
})

// The same late binding: closing a revoked person's connections is done by the collaboration server, which is built from the app's logger.
const liveAccess = createLiveAccess({
  facts: factsFromDatabase(database),
  collaboration,
  broadcaster,
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
app.log.info({ port: await collaboration.listen() }, 'collaboration server listening')
