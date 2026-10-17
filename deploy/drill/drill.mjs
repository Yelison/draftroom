#!/usr/bin/env node
// The checks of the backup and restore drill (deploy/drill/drill.sh starts the stack and calls this). It is a person's first
// day on the production stack, then a disaster and a recovery, driven over HTTPS and WSS like a browser would:
//
//   1. sign up with a real account and read the session cookie's flags,
//   2. create a document and write into it over the collaboration WebSocket, until the server says it stored the change,
//   3. take a backup and restore it into a database that did not exist,
//   4. start a second server on the restored database, sign in again with the same password and open the document.
//
// It needs NODE_EXTRA_CA_CERTS to trust the proxy's certificate authority. Nothing here is a secret: the account is made up
// for the run, and the password is generated for it.

import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { documentName, parseStatelessEvent } from '@draftroom/contract/collab'
import { fragmentName } from '@draftroom/editor-schema'
import { yUpdateToJson } from '@draftroom/editor-schema/convert'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import WebSocket from 'ws'
import * as Y from 'yjs'

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set; run this through deploy/drill/drill.sh`)
  return value
}

const origin = required('DRILL_ORIGIN')
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
const step = (message) => console.log(`[${String(++steps).padStart(2, '0')}] ${message}`)
function check(condition, message) {
  if (!condition) throw new Error(`drill failed: ${message}`)
}

// ---- HTTP, with the cookies a browser would keep ----------------------------------------------------------------------

const csrfHeader = 'x-csrf-token'

class Session {
  cookies = new Map()
  constructor(base) {
    this.base = base
  }
  remember(response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...flags] = line.split(';').map((part) => part.trim())
      const [name, ...value] = pair.split('=')
      this.cookies.set(name, { value: value.join('='), flags: flags.map((flag) => flag.toLowerCase()) })
    }
  }
  get cookieHeader() {
    return [...this.cookies].map(([name, { value }]) => `${name}=${value}`).join('; ')
  }
  async request(method, path, body) {
    const csrf = this.cookies.get('dr_csrf')?.value
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

async function waitUntilReady(base) {
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
function openDocument(collabUrl, session, documentId) {
  const doc = new Y.Doc()
  const stored = []
  const headers = { cookie: session.cookieHeader, origin: session.base }
  const socket = new HocuspocusProviderWebsocket({
    url: collabUrl,
    autoConnect: false,
    WebSocketPolyfill: class extends WebSocket {
      constructor(address) {
        super(address, { headers })
      }
    },
  })
  const synced = new Promise((resolve, reject) => {
    const provider = new HocuspocusProvider({
      name: documentName(documentId),
      document: doc,
      websocketProvider: socket,
      token: null,
      sessionAwareness: false,
      onSynced: ({ state }) => state && resolve(),
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
const paragraphsOf = (doc) =>
  (yUpdateToJson(Y.encodeStateAsUpdate(doc)).content ?? []).flatMap(({ content }) =>
    (content ?? []).map(({ text }) => text ?? ''),
  )

async function until(description, produce, milliseconds = 20_000) {
  const deadline = Date.now() + milliseconds
  for (;;) {
    const value = produce()
    if (value) return value
    check(Date.now() < deadline, `timed out waiting for ${description}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

// ---- The drill ---------------------------------------------------------------------------------------------------------

const collabOf = (base) => `${base.replace(/^http/, 'ws')}/collab`

step(`the stack answers on ${origin}`)
await waitUntilReady(origin)

step('the person signs up, and the session cookie is HttpOnly and Secure')
const session = new Session(origin)
const signUp = await session.request('POST', '/api/auth/sign-up', account)
check(signUp.status === 201, `sign-up answered ${signUp.status}`)
const sessionCookie = session.cookies.get('dr_session')
check(sessionCookie !== undefined, 'sign-up set no dr_session cookie')
check(sessionCookie.flags.includes('httponly'), 'the session cookie is not HttpOnly')
check(sessionCookie.flags.includes('secure'), 'the session cookie is not Secure')
const csrfCookie = session.cookies.get('dr_csrf')
check(csrfCookie !== undefined, 'sign-up set no dr_csrf cookie')
check(csrfCookie.flags.includes('secure'), 'the CSRF cookie is not Secure')

step('the person creates a document and writes into it over WSS, until the server says it stored it')
const { items: workspaces } = await (await session.request('GET', '/api/workspaces')).json()
check(workspaces.length === 1, `the person belongs to ${workspaces.length} workspaces`)
const created = await session.request('POST', `/api/workspaces/${workspaces[0].id}/documents`, { title: 'Minutes' })
check(created.status === 201, `creating the document answered ${created.status}`)
const documentId = (await created.json()).id
const writer = openDocument(collabOf(origin), session, documentId)
await writer.synced
const updates = []
writer.doc.on('update', (update) => updates.push(update))
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
const title = (await (await returning.request('GET', `/api/documents/${documentId}`)).json()).title
check(title === 'Minutes', `the restored document is titled "${title}"`)
const reader = openDocument(collabOf(`http://127.0.0.1:${restored.collab}`), returning, documentId)
await reader.synced
check(
  paragraphsOf(reader.doc).includes(sentence),
  `the restored document holds ${JSON.stringify(paragraphsOf(reader.doc))}`,
)
reader.close()

console.log(
  '\nThe drill passed: a backup of the production stack restored into a new database and opened with its content.',
)
process.exit(0)
