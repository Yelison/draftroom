import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { createInterface } from 'node:readline'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { devUserHeader } from '../src/http/auth/devIdentity.ts'
import { anchor, quote } from './support/comments.ts'
import { appendParagraph, storedParagraphs } from './support/collab/content.ts'
import { ClientSet } from './support/collab/provider-client.ts'
import { RawClient } from './support/collab/raw-client.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'
import { createDocument, createPerson, createWorkspace, join } from './support/world.ts'

// The process as it runs in production: one Node process with two listeners, which stores what it holds when it is told to
// stop, and which stops, whoever is still connected.

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

/** A port nobody is listening on: the system picks it, and it is released for the process that is about to use it. */
async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  await new Promise((resolve) => probe.close(resolve))
  if (address === null || typeof address === 'string') throw new Error('The system gave no port')
  return address.port
}

interface Running {
  readonly child: ChildProcess
  readonly apiPort: number
  readonly collabPort: number
}

/** Starts the server and resolves once both listeners are up, which it says in its log. */
async function start(): Promise<Running> {
  const [apiPort, collabPort] = [await freePort(), await freePort()]
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
  return { child, apiPort, collabPort }
}

describe('the server process', () => {
  it('serves REST and the collaboration WebSocket, and on SIGTERM stores the document it holds before it exits', async () => {
    const workspaceId = await createWorkspace(database.db)
    const owner = await createPerson(database.db, 'Marta Ruiz')
    await join(database.db, workspaceId, owner, 'owner')
    const documentId = await createDocument(database.db, { workspaceId, creator: owner })
    const { child, apiPort, collabPort } = await start()

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

  it('exits within seconds of SIGTERM although a socket never authenticated', async () => {
    const { child, collabPort } = await start()
    const idle = await RawClient.connect(`ws://127.0.0.1:${collabPort}`)
    const stopped = performance.now()

    child.kill('SIGTERM')
    const [code] = await once(child, 'exit')

    expect(code).toBe(0)
    // Without this the process waited for the deadline of Hocuspocus for a socket nobody authenticated: about 30 s.
    expect(performance.now() - stopped).toBeLessThan(8_000)
    idle.terminate()
  }, 20_000)

  it('tells the people who have a document open when a comment is written, through the one process that serves both', async () => {
    const workspaceId = await createWorkspace(database.db)
    const owner = await createPerson(database.db, 'Marta Ruiz')
    await join(database.db, workspaceId, owner, 'owner')
    const documentId = await createDocument(database.db, { workspaceId, creator: owner })
    const { apiPort, collabPort } = await start()
    const clients = new ClientSet(`ws://127.0.0.1:${collabPort}`)
    try {
      const reader = clients.open(documentId, { email: owner.email })
      await reader.waitForSynced()

      const response = await fetch(`http://127.0.0.1:${apiPort}/api/documents/${documentId}/threads`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [devUserHeader]: owner.email },
        body: JSON.stringify({ anchor, quote, body: 'Does the workshop fit before then?' }),
      })
      const { id } = (await response.json()) as { id: string }

      expect(response.status).toBe(201)
      expect(await reader.waitForCommentEvents(1)).toEqual([{ type: 'comments-changed', threadId: id }])
    } finally {
      clients.destroyAll()
    }
  }, 15_000)
})
