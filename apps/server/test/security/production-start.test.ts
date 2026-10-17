import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { newAccount } from '../support/auth.ts'
import { provisionDatabase, type TestDatabase } from '../support/postgres.ts'
import { createPerson, type Person } from '../support/world.ts'

// The server as a process, started the way a deployment starts it (threat table: development or demo identity in
// production). The refusals to start are in `src/main.test.ts`; this is what a server that did start does and says.

const entryPoint = new URL('../../src/main.ts', import.meta.url).pathname
const secret = 'a-secret-of-at-least-thirty-two-characters'

let database: TestDatabase
let person: Person
beforeAll(async () => {
  database = await provisionDatabase()
  person = await createPerson(database.db, 'Marta Ruiz')
})
afterAll(async () => {
  await database.drop()
})

async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  await new Promise((resolve) => probe.close(resolve))
  if (address === null || typeof address === 'string') throw new Error('No port')
  return address.port
}

interface Running {
  readonly api: string
  readonly output: () => string
}

const children: ChildProcess[] = []
afterEach(async () => {
  await Promise.all(
    children.splice(0).map((child) => {
      const exited = new Promise((resolve) => child.once('exit', resolve))
      child.kill('SIGTERM')
      return exited
    }),
  )
})

async function startServer(environment: NodeJS.ProcessEnv): Promise<Running> {
  const [apiPort, collabPort] = [await freePort(), await freePort()]
  let written = ''
  const child = spawn(process.execPath, [entryPoint], {
    env: {
      PATH: process.env['PATH'],
      DATABASE_URL: database.url,
      API_PORT: String(apiPort),
      COLLAB_PORT: String(collabPort),
      SESSION_SECRET: secret,
      ...environment,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  child.stdout.on('data', (chunk) => (written += String(chunk)))
  child.stderr.on('data', (chunk) => (written += String(chunk)))
  const api = `http://127.0.0.1:${apiPort}`
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`The server exited with ${child.exitCode}:\n${written}`)
    const alive = await fetch(`${api}/api/health/live`).then(
      (response) => response.ok,
      () => false,
    )
    if (alive) return { api, output: () => written }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`The server never answered:\n${written}`)
}

describe('the development identity', () => {
  it('serves in a server that is told it is development, which shows the header below is what is being refused', async () => {
    const { api } = await startServer({ NODE_ENV: 'development' })

    const response = await fetch(`${api}/api/me`, { headers: { 'x-dev-user': person.email } })

    expect(response.status).toBe(200)
  })

  it.each([
    ['production', { NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://draftroom.example' }],
    ['no environment at all, which a deployment forgets', {}],
  ])(
    'does not serve in a server started with %s: the header is a caller who is not signed in',
    async (_name, environment) => {
      const { api } = await startServer(environment)

      const response = await fetch(`${api}/api/me`, { headers: { 'x-dev-user': person.email } })

      expect(response.status).toBe(401)
    },
  )
})

describe('a server in production', () => {
  const production = { NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://draftroom.example' }

  it('says it must be reached over HTTPS, and sets only __Host- cookies', async () => {
    const { api } = await startServer(production)
    const account = newAccount()

    const response = await fetch(`${api}/api/auth/sign-up`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(account),
    })

    expect(response.status).toBe(201)
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
    const cookies = response.headers.getSetCookie().map((line) => line.split('=')[0])
    expect(cookies.sort()).toEqual(['__Host-dr_csrf', '__Host-dr_device', '__Host-dr_session'])
  })

  it('answers only to the origins it was told', async () => {
    const { api } = await startServer(production)

    const allowed = await fetch(`${api}/api/health/live`, { headers: { origin: 'https://draftroom.example' } })
    const stranger = await fetch(`${api}/api/health/live`, { headers: { origin: 'https://evil.example' } })

    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://draftroom.example')
    expect(stranger.headers.get('access-control-allow-origin')).toBeNull()
  })
})
