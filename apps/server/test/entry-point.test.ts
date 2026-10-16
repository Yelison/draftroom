import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { appendParagraph, storedParagraphs } from './support/collab/content.ts'
import { ClientSet } from './support/collab/provider-client.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createDocument, createPerson, createWorkspace, join } from './support/world.ts'

// The process as it runs in production: one Node process with two listeners, which stores what it holds when it is told to
// stop. The ports are the ones of this task's slot, which no other test uses.

const apiPort = 8381
const collabPort = 8481
const entryPoint = new URL('../src/main.ts', import.meta.url).pathname

let database: TestDatabase
let server: ChildProcess | undefined
beforeAll(async () => {
  database = await provisionDatabase()
})
afterEach(() => {
  // By its own process id: only what this test started.
  server?.kill('SIGKILL')
  server = undefined
})
afterAll(() => database.drop())

/** Starts the server and resolves once both listeners are up, which it says in its log. */
async function start(): Promise<ChildProcess> {
  const child = spawn(process.execPath, [entryPoint], {
    env: {
      PATH: process.env['PATH'] ?? '',
      NODE_ENV: 'test',
      DATABASE_URL: database.url,
      API_PORT: String(apiPort),
      COLLAB_PORT: String(collabPort),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  server = child
  const lines = createInterface({ input: child.stdout })
  for await (const line of lines) {
    if (line.includes('collaboration server listening')) break
  }
  return child
}

describe('the server process', () => {
  it('serves REST and the collaboration WebSocket, and on SIGTERM stores the document it holds before it exits', async () => {
    const workspaceId = await createWorkspace(database.db)
    const owner = await createPerson(database.db, 'Marta Ruiz')
    await join(database.db, workspaceId, owner, 'owner')
    const documentId = await createDocument(database.db, { workspaceId, creator: owner })
    const child = await start()

    const health = await fetch(`http://127.0.0.1:${apiPort}/api/health/live`)
    const clients = new ClientSet(`ws://127.0.0.1:${collabPort}`)
    const editor = clients.open(documentId, { email: owner.email })
    await editor.waitForSynced()
    editor.edit((doc) => appendParagraph(doc, 'held in memory when it was stopped'))
    // The server has the change in memory, and the store waits out its debounce of a second: nothing is in the database.
    await editor.waitForAcknowledged()
    expect(await storedParagraphs(database.db, documentId)).toEqual([])

    child.kill('SIGTERM')
    const [code] = await once(child, 'exit')
    clients.destroyAll()

    expect(health.status).toBe(200)
    expect(code).toBe(0)
    expect(await storedParagraphs(database.db, documentId)).toEqual(['held in memory when it was stopped'])
  }, 15_000)
})
