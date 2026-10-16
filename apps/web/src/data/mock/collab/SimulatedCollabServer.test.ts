import { documentName, parseStatelessEvent } from '@draftroom/contract/collab'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromBase64 } from '../../../collab/base64.ts'
import { SimulatedCollabServer, type Access, type Identity } from './SimulatedCollabServer.ts'

// The simulated server is checked against the provider it exists to talk to: if either side misreads a frame, nothing
// below converges.

const id = '3f6b1c2a-0000-4000-8000-000000000001'
const name = documentName(id)
const ana: Identity = { userId: 'user-ana', displayName: 'Ana Real' }
const ben: Identity = { userId: 'user-ben', displayName: 'Ben Real' }

const open: { provider: HocuspocusProvider; socket: HocuspocusProviderWebsocket }[] = []
afterEach(() => {
  for (const { provider, socket } of open.splice(0)) {
    provider.destroy()
    socket.destroy()
  }
})

function serverWith(access: Access | ((who: Identity | null) => Access) = { scope: 'read-write' }, options = {}) {
  return new SimulatedCollabServer({
    authorize: (_name, who) => (typeof access === 'function' ? access(who) : access),
    storeDelayMs: 20,
    ...options,
  })
}

function join(server: SimulatedCollabServer, who: Identity | null, document = new Y.Doc()) {
  const socket = new HocuspocusProviderWebsocket({
    url: 'ws://simulated.test',
    WebSocketPolyfill: server.socketFor(who),
  })
  const provider = new HocuspocusProvider({ name, document, token: null, websocketProvider: socket })
  provider.attach()
  open.push({ provider, socket })
  const stateless: string[] = []
  provider.on('stateless', ({ payload }: { payload: string }) => stateless.push(payload))
  return { provider, document, stateless }
}

const text = (document: Y.Doc) => document.getText('t').toString()

describe('the simulated collaboration server, read by the real provider', () => {
  it('authenticates a person, runs the handshake and carries edits both ways', async () => {
    const server = serverWith()
    const first = join(server, ana)
    const second = join(server, ben)
    await vi.waitFor(() => expect([first.provider.synced, second.provider.synced]).toEqual([true, true]))

    first.document.getText('t').insert(0, 'hello')
    await vi.waitFor(() => expect(text(second.document)).toBe('hello'))
    second.document.getText('t').insert(5, ' world')
    await vi.waitFor(() => expect(text(first.document)).toBe('hello world'))

    expect(first.provider.authorizedScope).toBe('read-write')
    await vi.waitFor(() => expect(first.provider.unsyncedChanges).toBe(0))
  })

  it('serves what a document already holds to a client that joins later', async () => {
    const server = serverWith()
    server.document(name).getText('t').insert(0, 'already here')

    const late = join(server, ana)

    await vi.waitFor(() => expect(text(late.document)).toBe('already here'))
  })

  it('answers a reader with its scope and applies none of what it sends', async () => {
    const server = serverWith((who) => (who === ben ? { scope: 'readonly' } : { scope: 'read-write' }))
    const reader = join(server, ben)
    await vi.waitFor(() => expect(reader.provider.synced).toBe(true))

    reader.document.getText('t').insert(0, 'forged')
    await vi.waitFor(() => expect(reader.provider.unsyncedChanges).toBeGreaterThan(0))

    expect(reader.provider.authorizedScope).toBe('readonly')
    expect(text(server.document(name))).toBe('')
  })

  it('tells the person who is not allowed that the document is not found, and sends it nothing', async () => {
    const server = serverWith({ denied: 'not-found' })
    const denied = vi.fn()
    server.document(name).getText('t').insert(0, 'secret')
    const { provider, document } = join(server, ana)
    provider.on('authenticationFailed', denied)

    await vi.waitFor(() => expect(denied).toHaveBeenCalledWith({ reason: 'not-found' }))

    expect(text(document)).toBe('')
  })

  it('refuses a connection that is not signed in as unauthenticated', async () => {
    const denied = vi.fn()
    const { provider } = join(serverWith(), null)
    provider.on('authenticationFailed', denied)

    await vi.waitFor(() => expect(denied).toHaveBeenCalledWith({ reason: 'unauthenticated' }))
  })

  it('stores a debounce after a change and says so with a snapshot of exactly what was stored', async () => {
    const server = serverWith()
    const { provider, document, stateless } = join(server, ana)
    await vi.waitFor(() => expect(provider.synced).toBe(true))
    stateless.length = 0

    document.getText('t').insert(0, 'abc')

    await vi.waitFor(() => expect(stateless).toHaveLength(1))
    const event = parseStatelessEvent(stateless[0] ?? '')
    const snapshot = Y.decodeSnapshot(fromBase64(event?.type === 'stored' ? event.snapshot : '') ?? new Uint8Array())
    expect(Y.snapshotContainsUpdate(snapshot, Y.encodeStateAsUpdate(document))).toBe(true)
  })

  it('does not send a reader the stored event', async () => {
    const server = serverWith({ scope: 'readonly' })
    const { provider, stateless } = join(server, ben)
    await vi.waitFor(() => expect(provider.synced).toBe(true))
    server.document(name).getText('t').insert(0, 'x')

    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(stateless.map((payload) => parseStatelessEvent(payload)?.type)).not.toContain('stored')
  })

  it('says who a person is by the name it knows, whatever the client wrote', async () => {
    const server = serverWith()
    const first = join(server, ana)
    const second = join(server, ben)
    await vi.waitFor(() => expect([first.provider.synced, second.provider.synced]).toEqual([true, true]))

    first.provider.setAwarenessField('user', { id: ana.userId, name: 'Someone Else', color: '#336699' })

    await vi.waitFor(() => {
      const seen = [...(second.provider.awareness?.getStates().values() ?? [])]
      expect(seen).toContainEqual({ user: { id: ana.userId, name: 'Ana Real', color: '#336699' } })
    })
  })

  it('drops the awareness of a client that speaks as another person', async () => {
    const server = serverWith()
    const first = join(server, ana)
    const second = join(server, ben)
    await vi.waitFor(() => expect([first.provider.synced, second.provider.synced]).toEqual([true, true]))

    first.provider.setAwarenessField('user', { id: ben.userId, name: 'Ben Real', color: '#336699' })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const seen = [...(second.provider.awareness?.getStates().entries() ?? [])]
    expect(seen.filter(([clientId]) => clientId === first.document.clientID)).toEqual([])
  })

  it('drops the awareness of a client whose colour could not be put safely in a style', async () => {
    const server = serverWith()
    const first = join(server, ana)
    const second = join(server, ben)
    await vi.waitFor(() => expect([first.provider.synced, second.provider.synced]).toEqual([true, true]))

    first.provider.setAwarenessField('user', { id: ana.userId, name: 'Ana', color: 'red; background: url(x)' })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const seen = [...(second.provider.awareness?.getStates().keys() ?? [])]
    expect(seen).not.toContain(first.document.clientID)
  })

  it('closes a connection that sends more than 64 messages before it is authenticated, with 4205', async () => {
    const server = serverWith({ scope: 'read-write' }, { loadDelayMs: 100 })
    const { provider, document } = join(server, ana)
    const closed = vi.fn()
    provider.on('close', closed)
    await vi.waitFor(() => expect(provider.configuration.websocketProvider.status).toBe('connected'))

    // Every edit is a message while the server is still loading: the provider sends them as they happen.
    for (let edit = 0; edit < 70; edit += 1) document.getText('t').insert(0, 'x')

    await vi.waitFor(() => expect(closed).toHaveBeenCalledWith({ event: expect.objectContaining({ code: 4205 }) }))
  })

  it('delivers what was sent before a close ahead of the close, in order, as the real transport does', async () => {
    const server = serverWith()
    const { provider } = join(server, ana)
    await vi.waitFor(() => expect(provider.synced).toBe(true))
    const heard: string[] = []
    provider.on('stateless', ({ payload }: { payload: string }) =>
      heard.push(parseStatelessEvent(payload)?.type ?? '?'),
    )
    provider.on('close', () => heard.push('close'))

    server.broadcast(name, { type: 'access-changed' })
    server.closeConnections(4403, 'access-revoked')

    await vi.waitFor(() => expect(heard).toContain('close'))
    expect(heard).toEqual(['access-changed', 'close'])
  })
})
