import { documentName } from '@draftroom/contract/collab'
import { fragmentName } from '@draftroom/editor-schema'
// oxlint-disable-next-line no-restricted-imports
import { jsonToYUpdate } from '@draftroom/editor-schema/convert'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimulatedCollabServer, type Identity } from './SimulatedCollabServer.ts'
import { joinTabs, type TabLink, type TabMessage, type TabTransport } from './tabLink.ts'

// Two tabs are two servers, each with its own copy of the documents, on a bus that stands for the BroadcastChannel.

const name = documentName('3f6b1c2a-0000-4000-8000-000000000001')
const ana: Identity = { userId: 'user-ana', displayName: 'Ana Real' }
const ben: Identity = { userId: 'user-ben', displayName: 'Ben Real' }

/** What a `BroadcastChannel` does: each tab hears what the others post, and not what it posts itself. */
function createBus() {
  const transports = new Set<{ transport: TabTransport; deliver: (message: TabMessage) => void }>()
  return {
    connect(): TabTransport {
      const listeners = new Set<(message: TabMessage) => void>()
      const entry = {
        deliver: (message: TabMessage) => listeners.forEach((listener) => listener(message)),
        transport: {
          post(message: TabMessage) {
            for (const other of transports) if (other !== entry) queueMicrotask(() => other.deliver(message))
          },
          listen(listener: (message: TabMessage) => void) {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
        },
      }
      transports.add(entry)
      return entry.transport
    },
  }
}

const startingContent = () =>
  jsonToYUpdate({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The plan' }] }] })

interface Tab {
  server: SimulatedCollabServer
  link: TabLink
}

/** A tab of the demo: the first to be opened starts the world and writes the document's text, the others receive it. */
async function openTab(bus: ReturnType<typeof createBus>, peer: string, fresh = false): Promise<Tab> {
  let link: TabLink | undefined
  const server = new SimulatedCollabServer({
    authorize: () => ({ scope: 'read-write' }),
    storeDelayMs: 20,
    initialContent: () => (link?.mayStartContent() === true ? startingContent() : undefined),
  })
  link = await joinTabs(server, bus.connect(), { peer, now: () => Date.now(), discoveryMs: 5, fresh })
  return { server, link }
}

/** The paragraphs of a document, as the text a person reads. */
const paragraphs = (document: Y.Doc) =>
  document
    .getXmlFragment(fragmentName)
    .toArray()
    .map((node) => (node instanceof Y.XmlElement ? node.get(0)?.toString() : undefined))

const typeAtTheEnd = (document: Y.Doc, text: string) => {
  const last = document.getXmlFragment(fragmentName).toArray().at(-1)
  const target = last instanceof Y.XmlElement ? last.get(0) : undefined
  if (!(target instanceof Y.XmlText)) throw new Error('The document has no paragraph to type in')
  target.insert(target.length, text)
}

const open: { provider: HocuspocusProvider; socket: HocuspocusProviderWebsocket }[] = []
afterEach(() => {
  for (const { provider, socket } of open.splice(0)) {
    provider.destroy()
    socket.destroy()
  }
})

/** A person connected to the tab, who says where they are in the document as an editor does. */
function connect(server: SimulatedCollabServer, who: Identity) {
  const socket = new HocuspocusProviderWebsocket({
    url: 'ws://simulated.test',
    WebSocketPolyfill: server.socketFor(who),
  })
  const provider = new HocuspocusProvider({ name, document: new Y.Doc(), token: null, websocketProvider: socket })
  provider.attach()
  provider.setAwarenessField('user', { id: who.userId, name: who.displayName, color: '#1d4ed8' })
  open.push({ provider, socket })
  return provider
}

const peopleSeenBy = (provider: HocuspocusProvider) =>
  [...(provider.awareness?.getStates().values() ?? [])].flatMap((state) => {
    const user: unknown = state['user']
    return typeof user === 'object' && user !== null && 'name' in user ? [user.name] : []
  })

describe('the tabs of the demo', () => {
  it('open one document that has its text once, and not once per tab', async () => {
    const bus = createBus()
    const first = await openTab(bus, 'tab-1')
    const second = await openTab(bus, 'tab-2')

    // The second tab opens a document that the first never did: the first writes it, to answer.
    const inSecond = second.server.document(name)
    await vi.waitFor(() => expect(paragraphs(inSecond)).toEqual(['The plan']))

    expect(paragraphs(first.server.document(name))).toEqual(['The plan'])
    expect(second.link.world).toBe(first.link.world)
  })

  it('carry what is written in one tab to the other, both ways', async () => {
    const bus = createBus()
    const first = await openTab(bus, 'tab-1')
    const second = await openTab(bus, 'tab-2')
    const inFirst = first.server.document(name)
    const inSecond = second.server.document(name)
    await vi.waitFor(() => expect(paragraphs(inSecond)).toEqual(['The plan']))

    typeAtTheEnd(inFirst, ', first draft')
    await vi.waitFor(() => expect(paragraphs(inSecond)).toEqual(['The plan, first draft']))
    typeAtTheEnd(inSecond, ' and a second one')
    await vi.waitFor(() => expect(paragraphs(inFirst)).toEqual(['The plan, first draft and a second one']))
  })

  it('show the people of one tab to the other, until their tab goes away', async () => {
    const bus = createBus()
    const first = await openTab(bus, 'tab-1')
    const second = await openTab(bus, 'tab-2')
    const watcher = connect(second.server, ben)
    connect(first.server, ana)

    await vi.waitFor(() => expect(peopleSeenBy(watcher)).toContain('Ana Real'))

    first.link.close()
    await vi.waitFor(() => expect(peopleSeenBy(watcher)).not.toContain('Ana Real'))
    expect(peopleSeenBy(watcher)).toContain('Ben Real')
  })

  it('ignore what another world says: a reloaded tab starts again and shares nothing with the old one', async () => {
    const bus = createBus()
    const first = await openTab(bus, 'tab-1')
    const second = await openTab(bus, 'tab-2')
    const reloaded = await openTab(bus, 'tab-3', true)
    const inReloaded = reloaded.server.document(name)
    const inSecond = second.server.document(name)
    await vi.waitFor(() => expect(paragraphs(inSecond)).toEqual(['The plan']))

    typeAtTheEnd(first.server.document(name), ', first draft')
    await vi.waitFor(() => expect(paragraphs(inSecond)).toEqual(['The plan, first draft']))
    typeAtTheEnd(inReloaded, ' (the new world)')

    // The tabs of the old world heard each other, and none of them heard the new one, nor it them.
    await vi.waitFor(() => expect(paragraphs(inReloaded)).toEqual(['The plan (the new world)']))
    expect(paragraphs(inSecond)).toEqual(['The plan, first draft'])
    expect(reloaded.link.world).not.toBe(first.link.world)
  })

  it('leave the starting text to whichever tab opens a document first once the tab that started the world is gone', async () => {
    const bus = createBus()
    const first = await openTab(bus, 'tab-1')
    const second = await openTab(bus, 'tab-2')
    expect(second.link.mayStartContent()).toBe(false)

    first.link.close()
    await vi.waitFor(() => expect(second.link.mayStartContent()).toBe(true))

    expect(paragraphs(second.server.document(name))).toEqual(['The plan'])
  })
})
