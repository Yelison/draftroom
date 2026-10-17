import { documentName } from '@draftroom/contract/collab'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { afterEach, describe, expect, it } from 'vitest'
import { fakePage } from './fakePage.ts'
import { collaboratorScripts } from '../fixtures/collaboratorScripts.ts'
import { marta } from '../fixtures/people.ts'
import type { PageEnvironment } from './browserPage.ts'
import { seatCollaborators } from './collaborators.ts'
import { SimulatedCollabServer } from './SimulatedCollabServer.ts'

// Where she is and when: the tabs and the connections decide, and the server is what says who is in the document.

const script = collaboratorScripts[0]
if (script === undefined) throw new Error('The demo has no collaborator')
const scripts = [script]
const name = documentName(script.documentId)

const open: { provider: HocuspocusProvider; socket: HocuspocusProviderWebsocket }[] = []
const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  for (const { provider, socket } of open.splice(0)) {
    provider.destroy()
    socket.destroy()
  }
})

function visitor(server: SimulatedCollabServer) {
  const socket = new HocuspocusProviderWebsocket({
    url: 'ws://simulated.test',
    WebSocketPolyfill: server.socketFor({ userId: marta.id, displayName: marta.name ?? marta.email }),
  })
  const provider = new HocuspocusProvider({ name, document: new Y.Doc(), token: null, websocketProvider: socket })
  provider.attach()
  const entry = { provider, socket }
  open.push(entry)
  return () => {
    provider.destroy()
    socket.destroy()
    open.splice(open.indexOf(entry), 1)
  }
}

function serverWithCollaborator(page: PageEnvironment) {
  const server = new SimulatedCollabServer({ authorize: () => ({ scope: 'read-write' }) })
  stops.push(seatCollaborators(server, scripts, 'en', page))
  return server
}

/** Another tab that has the turn to play her: whoever asks waits until it lets go, or gives up when the wait is aborted. */
function tabThatHasTheTurn() {
  const waiting: (() => void)[] = []
  return {
    takeTurn: (_key: string, signal: AbortSignal) =>
      new Promise<(() => void) | null>((resolve) => {
        waiting.push(() => resolve(() => undefined))
        signal.addEventListener('abort', () => resolve(null))
      }),
    letGo: () => waiting.splice(0).forEach((grant) => grant()),
  }
}

const connections = (server: SimulatedCollabServer) => server.connectionsTo(name)
const settle = () => new Promise((resolve) => setTimeout(resolve, 150))

describe('the collaborators of the demo', () => {
  it('are in the document while someone else has it open, and leave with them', async () => {
    const server = serverWithCollaborator(fakePage().page)
    expect(connections(server)).toBe(0)

    const leave = visitor(server)
    await expect.poll(() => connections(server)).toBe(2)

    leave()
    await expect.poll(() => connections(server)).toBe(0)
  })

  it('leave when the tab is hidden and come back when it is shown', async () => {
    const { page, show } = fakePage()
    const server = serverWithCollaborator(page)
    visitor(server)
    await expect.poll(() => connections(server)).toBe(2)

    show(true)
    await expect.poll(() => connections(server)).toBe(1)

    show(false)
    await expect.poll(() => connections(server)).toBe(2)
  })

  it('wait their turn while another tab has them, and come in when it lets go', async () => {
    const otherTab = tabThatHasTheTurn()
    const server = serverWithCollaborator(fakePage({ takeTurn: otherTab.takeTurn }).page)

    visitor(server)
    await settle()
    expect(connections(server)).toBe(1)

    otherTab.letGo()
    await expect.poll(() => connections(server)).toBe(2)
  })

  it('do not come in after the wait was given up because the tab was hidden', async () => {
    const otherTab = tabThatHasTheTurn()
    const { page, show } = fakePage({ takeTurn: otherTab.takeTurn })
    const server = serverWithCollaborator(page)
    visitor(server)
    await settle()

    show(true)
    otherTab.letGo()
    await settle()

    expect(connections(server)).toBe(1)
  })

  it('do not come in when their turn arrives just as the tab is hidden', async () => {
    const otherTab = tabThatHasTheTurn()
    const { page, show } = fakePage({ takeTurn: otherTab.takeTurn })
    const server = serverWithCollaborator(page)
    visitor(server)
    await settle()

    otherTab.letGo()
    show(true)
    await settle()

    expect(connections(server)).toBe(1)
  })

  it('are in the document once when the tab is hidden and shown again at once', async () => {
    const { page, show } = fakePage()
    const server = serverWithCollaborator(page)
    visitor(server)
    await expect.poll(() => connections(server)).toBe(2)

    show(true)
    show(false)
    await settle()

    expect(connections(server)).toBe(2)
  })

  it('are not in a document nobody has opened', async () => {
    const server = serverWithCollaborator(fakePage().page)

    await settle()

    expect(connections(server)).toBe(0)
  })
})
