// The checks of the backup and restore drill (deploy/drill/drill.sh starts the stack and calls this). It is a person's first
// day on the production stack, then a disaster and a recovery, driven over HTTPS and WSS like a browser would:
//
//   1. read what the proxy sends: the headers of the document on the web app's files and not their values on the API, and the redirect from HTTP,
//   2. sign up with a real account and read the session cookies' flags,
//   3. create a document and write into it over the collaboration WebSocket, until the server says it stored the change,
//   4. take a backup and restore it into a database that did not exist,
//   5. start a second server on the restored database, sign in again with the same password and open the document,
//   6. check that two people behind the proxy do not share a limit on requests (TRUST_PROXY, ADR 0017).
//
// It needs NODE_EXTRA_CA_CERTS to trust the proxy's certificate authority. Nothing here is a secret: the account is made up
// for the run, and the password is generated for it.

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { documentName, parseStatelessEvent } from '@draftroom/contract/collab'
import { fragmentName } from '@draftroom/editor-schema'
import { yUpdateToJson } from '@draftroom/editor-schema/convert'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { z } from 'zod'

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set; run this through deploy/drill/drill.sh`)
  return value
}

const origin = required('DRILL_ORIGIN')
const plainHttpOrigin = required('DRILL_HTTP_ORIGIN')
// Behind HTTPS the cookies are `__Host-` cookies (ADR 0004), which is what a production server sets.
const cookieNames = { session: '__Host-dr_session', csrf: '__Host-dr_csrf' } as const
const restored = { api: required('DRILL_RESTORED_API'), collab: required('DRILL_RESTORED_COLLAB') }
const scripts = new URL('../../scripts/', import.meta.url).pathname
const drillDirectory = new URL('./', import.meta.url).pathname

const account = {
  email: `drill-${randomUUID()}@draftroom.example`,
  name: 'Drill Person',
  password: randomBytes(18).toString('base64url'),
}
const sentence = `The minutes were written before the disaster ${randomUUID()}`

let steps = 0
const step = (message: string): void => console.log(`[${String(++steps).padStart(2, '0')}] ${message}`)
function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`drill failed: ${message}`)
}

// ---- HTTP, with the cookies a browser would keep ----------------------------------------------------------------------

const csrfHeader = 'x-csrf-token'

interface Cookie {
  readonly value: string
  readonly flags: readonly string[]
}

/** What a JSON answer has to hold for the drill to go on: the rest of it is not the drill's business. */
async function parse<Shape extends z.ZodType>(response: Response, shape: Shape): Promise<z.infer<Shape>> {
  return shape.parse(await response.json())
}
const identified = z.object({ id: z.string() })
const titled = z.object({ title: z.string() })
const workspaceList = z.object({ items: z.array(identified) })

class Session {
  readonly cookies = new Map<string, Cookie>()
  readonly base: string

  constructor(base: string) {
    this.base = base
  }

  private remember(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      const [pair = '', ...flags] = line.split(';').map((part) => part.trim())
      const [name = '', ...value] = pair.split('=')
      this.cookies.set(name, { value: value.join('='), flags: flags.map((flag) => flag.toLowerCase()) })
    }
  }
  get cookieHeader(): string {
    return [...this.cookies].map(([name, { value }]) => `${name}=${value}`).join('; ')
  }
  async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
    const csrf = this.cookies.get(cookieNames.csrf)?.value
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        cookie: this.cookieHeader,
        origin: this.base,
        ...(csrf === undefined || method === 'GET' ? {} : { [csrfHeader]: csrf }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    this.remember(response)
    return response
  }
}

async function waitUntilReady(base: string): Promise<void> {
  const deadline = Date.now() + 60_000
  for (;;) {
    try {
      if ((await fetch(`${base}/api/health/ready`)).ok) return
    } catch {
      // Not listening yet.
    }
    check(Date.now() < deadline, `${base} was not ready in a minute`)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

// ---- The collaboration WebSocket ---------------------------------------------------------------------------------------

/** Opens a document as the session's person, over a Node WebSocket that sends the cookie the browser would send. */
interface StoredEvent {
  readonly snapshot: string
}

interface OpenDocument {
  readonly doc: Y.Doc
  readonly stored: StoredEvent[]
  readonly synced: Promise<void>
  close(): void
}

function openDocument(collabUrl: string, session: Session, documentId: string): OpenDocument {
  const doc = new Y.Doc()
  const stored: StoredEvent[] = []
  const headers = { cookie: session.cookieHeader, origin: session.base }
  const socket = new HocuspocusProviderWebsocket({
    url: collabUrl,
    autoConnect: false,
    WebSocketPolyfill: class extends WebSocket {
      constructor(address: string | URL) {
        super(address, { headers })
      }
    },
  })
  const synced = new Promise<void>((resolve, reject) => {
    const provider = new HocuspocusProvider({
      name: documentName(documentId),
      document: doc,
      websocketProvider: socket,
      token: null,
      sessionAwareness: false,
      onSynced: ({ state }) => {
        if (state) resolve()
      },
      onAuthenticationFailed: ({ reason }) =>
        reject(new Error(`the collaboration server refused the connection: ${reason}`)),
      onStateless: ({ payload }) => {
        const event = parseStatelessEvent(payload)
        if (event?.type === 'stored') stored.push(event)
      },
    })
    provider.attach()
    void socket.connect()
    doc.on('destroy', () => provider.destroy())
  })
  return { doc, stored, synced, close: () => socket.destroy() }
}

/** The paragraphs of a document as the schema reads them. */
const paragraphsOf = (doc: Y.Doc): string[] =>
  (yUpdateToJson(Y.encodeStateAsUpdate(doc)).content ?? []).flatMap(({ content }) =>
    (content ?? []).map(({ text }) => text ?? ''),
  )

async function until<Value>(
  description: string,
  produce: () => Value | undefined,
  milliseconds = 20_000,
): Promise<Value> {
  const deadline = Date.now() + milliseconds
  for (;;) {
    const value = produce()
    if (value !== undefined) return value
    check(Date.now() < deadline, `timed out waiting for ${description}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** The status the API gives `/api/me` to a request made from inside the proxy's container, with nothing in it but a wget. */
function proxyContainerStatus(): number {
  const container = required('DRILL_PROXY_CONTAINER')
  const outcome = spawnSync(
    'docker',
    [
      'exec',
      container,
      'wget',
      '--no-check-certificate',
      '--server-response',
      '--output-document=/dev/null',
      'https://localhost/api/me',
    ],
    { encoding: 'utf8' },
  )
  const status = /HTTP\/\d(?:\.\d)? (\d{3})/.exec(outcome.stderr)?.[1]
  check(status !== undefined, `could not read the status of a request from inside the proxy: ${outcome.stderr}`)
  return Number(status)
}

// ---- The drill ---------------------------------------------------------------------------------------------------------

const collabOf = (base: string): string => `${base.replace(/^http/, 'ws')}/collab`

step(`the stack answers on ${origin}`)
await waitUntilReady(origin)

step("the proxy sends the headers of the document with the web app, and its values never with the API's")
const documentHeaders = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cross-origin-opener-policy': 'same-origin',
}
const page = await fetch(origin)
for (const [name, value] of Object.entries(documentHeaders)) {
  check(page.headers.get(name) === value, `the page has ${name}: ${page.headers.get(name) ?? 'nothing'}, not ${value}`)
}
check(page.headers.has('permissions-policy'), 'the page has no Permissions-Policy')
// Contains, not equals: T7.2 writes the rest of the policy into the same header, and the page must stay out of other sites' frames.
check(
  page.headers.get('content-security-policy')?.includes("frame-ancestors 'none'") === true,
  `the page's Content-Security-Policy does not forbid frames: ${page.headers.get('content-security-policy') ?? 'nothing'}`,
)
check(!page.headers.has('server'), `the page names its server: ${page.headers.get('server') ?? ''}`)
// The policy is generated from the page the proxy serves, so the hash of each inline script of that page is in it, and the
// connections it allows are to the host the browser used (the page's own <meta> allows `wss:` and the header narrows it).
const policy = page.headers.get('content-security-policy') ?? ''
const inlineScripts = [...(await page.text()).matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
  ([, text]) => text ?? '',
)
check(inlineScripts.length > 0, 'the page has no inline script to take a hash of')
for (const text of inlineScripts) {
  const hash = `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`
  check(policy.includes(hash), `the page's policy does not name its inline script ${hash}`)
}
check(!/script-src[^;]*'unsafe-/.test(policy), `the page's policy lets scripts run inline or by eval: ${policy}`)
check(
  policy.includes(`connect-src 'self' wss://${new URL(origin).host};`),
  `the page's policy does not limit connections to ${new URL(origin).host}: ${policy}`,
)
const api = await fetch(`${origin}/api/health/live`)
check(api.ok, `the API's liveness answered ${api.status}`)
// Not that the API carries none of these headers: the server sets its own there (a policy, `nosniff`, a referrer policy, HSTS),
// and the proxy must not add its own over them. So what is checked is that the proxy's values are not what the API says.
check(
  api.headers.get('referrer-policy') !== documentHeaders['referrer-policy'],
  `the API answer has the proxy's Referrer-Policy, ${documentHeaders['referrer-policy']}`,
)
check(
  api.headers.get('content-security-policy') !== "frame-ancestors 'none'",
  "the API answer has the proxy's Content-Security-Policy, frame-ancestors 'none' and nothing else",
)
check(
  !api.headers.has('cross-origin-opener-policy'),
  'the API answer has a Cross-Origin-Opener-Policy, which only the proxy sets, and only on the web app',
)

step('plain HTTP is sent to the address people use, port included')
const redirect = await fetch(`${plainHttpOrigin}/documents/abc?tab=1`, { redirect: 'manual' })
check(redirect.status === 301, `plain HTTP answered ${redirect.status}`)
check(
  redirect.headers.get('location') === `${origin}/documents/abc?tab=1`,
  `plain HTTP was sent to ${redirect.headers.get('location') ?? 'nowhere'}, not to ${origin}`,
)

step('the person signs up, and the session cookie is HttpOnly and Secure')
const session = new Session(origin)
const signUp = await session.request('POST', '/api/auth/sign-up', account)
check(signUp.status === 201, `sign-up answered ${signUp.status}`)
const sessionCookie = session.cookies.get(cookieNames.session)
check(sessionCookie !== undefined, `sign-up set no ${cookieNames.session} cookie`)
check(
  sessionCookie.flags.includes('path=/') && !sessionCookie.flags.some((flag) => flag.startsWith('domain=')),
  'the session cookie is not a __Host- cookie: it needs Path=/ and no Domain',
)
check(sessionCookie.flags.includes('httponly'), 'the session cookie is not HttpOnly')
check(sessionCookie.flags.includes('secure'), 'the session cookie is not Secure')
const csrfCookie = session.cookies.get(cookieNames.csrf)
check(csrfCookie !== undefined, `sign-up set no ${cookieNames.csrf} cookie`)
check(csrfCookie.flags.includes('secure'), 'the CSRF cookie is not Secure')

step('the person creates a document and writes into it over WSS, until the server says it stored it')
const { items: workspaces } = await parse(await session.request('GET', '/api/workspaces'), workspaceList)
check(workspaces.length === 1, `the person belongs to ${workspaces.length} workspaces`)
const [workspace] = workspaces
check(workspace !== undefined, 'the person has no workspace')
const created = await session.request('POST', `/api/workspaces/${workspace.id}/documents`, { title: 'Minutes' })
check(created.status === 201, `creating the document answered ${created.status}`)
const { id: documentId } = await parse(created, identified)
const writer = openDocument(collabOf(origin), session, documentId)
await writer.synced
const updates: Uint8Array[] = []
writer.doc.on('update', (update: Uint8Array) => updates.push(update))
writer.doc.transact(() => {
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(sentence)])
  writer.doc.getXmlFragment(fragmentName).insert(0, [paragraph])
})
const written = Y.mergeUpdates(updates)
await until('a stored event that covers the change', () =>
  writer.stored.find((event) =>
    Y.snapshotContainsUpdate(Y.decodeSnapshot(Buffer.from(event.snapshot, 'base64')), written),
  ),
)
writer.close()

step('a backup is taken, and restored into a database that did not exist')
const archive = execFileSync('bash', [`${scripts}backup.sh`], { env: process.env })
  .toString()
  .trim()
console.log(`     ${archive}`)
execFileSync('bash', [`${scripts}restore.sh`, archive, 'draftroom_restored'], { env: process.env, stdio: 'inherit' })

step('a second server starts on the restored database')
execFileSync('bash', [`${drillDirectory}start-restored-server.sh`], { env: process.env, stdio: 'inherit' })
const restoredApi = `http://127.0.0.1:${restored.api}`
await waitUntilReady(restoredApi)

step('the same person signs in with the same password, and the document opens with what was written')
const returning = new Session(restoredApi)
const signIn = await returning.request('POST', '/api/auth/sign-in', {
  email: account.email,
  password: account.password,
})
check(signIn.status === 200, `signing in on the restored database answered ${signIn.status}`)
const { title } = await parse(await returning.request('GET', `/api/documents/${documentId}`), titled)
check(title === 'Minutes', `the restored document is titled "${title}"`)
const reader = openDocument(collabOf(`http://127.0.0.1:${restored.collab}`), returning, documentId)
await reader.synced
check(
  paragraphsOf(reader.doc).includes(sentence),
  `the restored document holds ${JSON.stringify(paragraphsOf(reader.doc))}`,
)
reader.close()

step('two people behind the proxy do not share a limit: a burst from one slows only that one down')
// The proxy tells the server who the caller is, and the server believes it because the proxy is in `TRUST_PROXY`. Were it not,
// every request would come from the proxy and the limit of one address would be everybody's. The first person is this process,
// reaching the proxy from outside; the second is the proxy's own container, which reaches itself from 127.0.0.1.
const burst = await Promise.all(
  Array.from({ length: 700 }, () => fetch(`${origin}/api/me`).then(({ status }) => status)),
)
const refused = burst.filter((status) => status === 429).length
check(refused > 0, `700 requests at once from one address were not limited (${refused} refused)`)
const second = proxyContainerStatus()
check(
  second === 401,
  `a second person, from another address, got ${second} after the first one's burst; 401 was expected`,
)

console.log(
  '\nThe drill passed: a backup of the production stack restored into a new database and opened with its content.',
)
process.exit(0)
