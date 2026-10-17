import type { DataSource, RestSource } from '../DataSource.ts'
import { createDemo, type DemoOptions } from './collab/demo.ts'
import { replaceLiveContent } from './collab/liveContent.ts'
import { SimulatedCollabServer, type Access, type Identity } from './collab/SimulatedCollabServer.ts'
import { marta } from './fixtures/index.ts'
import type { Context, Session } from './guards.ts'
import { activityOperations } from './operations/activity.ts'
import { documentOperations } from './operations/documents.ts'
import { folderOperations } from './operations/folders.ts'
import { memberOperations } from './operations/members.ts'
import { pinOperations } from './operations/pins.ts'
import { sessionOperations } from './operations/session.ts'
import { sharingOperations } from './operations/sharing.ts'
import { templateOperations } from './operations/templates.ts'
import { threadOperations } from './operations/threads.ts'
import { versionOperations } from './operations/versions.ts'
import { workspaceOperations } from './operations/workspaces.ts'
import { atLeast, documentRole } from './roles.ts'
import { createWorld, type World } from './world.ts'
import { documentName, parseDocumentName } from '@draftroom/contract/collab'
import { readStoredLocale, resolveLocale } from '../../i18n/locale.ts'
import * as Y from 'yjs'

export interface ConnectOptions {
  /** The email of the person already signed in on this connection; nobody is signed in when it is left out. */
  signedInAs?: string
}

/**
 * One mock server and the people who talk to it. Each `connect` is one browser with its own session, all of them on
 * the same data: what one does, the others read. The state belongs to the world and starts from the fixtures, so
 * creating another world starts again.
 */
export interface MockServer {
  connect(options?: ConnectOptions): DataSource
  /** The collaboration server of this world, which every connection's documents are opened on. */
  readonly collaboration: SimulatedCollabServer
  /** Puts people in a document, each with a connection of their own; resolves with what ends them. */
  addPeople(documentId: string, names: readonly string[]): Promise<() => void>
}

/** What the collaboration server lets a person do with a document: the role decides, and an archived one is only read. */
function accessTo(world: World, documentName: string, identity: Identity | null): Access {
  const documentId = parseDocumentName(documentName)
  const document = world.documents.find((row) => row.id === documentId)
  const role = document === undefined || identity === null ? undefined : documentRole(world, identity.userId, document)
  if (document === undefined || role === undefined) return { denied: 'not-found' }
  return { scope: atLeast(role, 'editor') && document.archivedAt === null ? 'read-write' : 'readonly' }
}

function operationsOf(ctx: Context, collaboration: SimulatedCollabServer, identity: Identity | null): DataSource {
  const rest: RestSource = {
    ...sessionOperations(ctx),
    ...workspaceOperations(ctx),
    ...memberOperations(ctx),
    ...folderOperations(ctx),
    ...documentOperations(ctx),
    ...pinOperations(ctx),
    ...sharingOperations(ctx),
    ...threadOperations(ctx),
    ...versionOperations(ctx),
    ...activityOperations(ctx),
    ...templateOperations(ctx),
  }
  return {
    ...rest,
    collaboration: { url: 'ws://simulated.invalid', webSocket: collaboration.socketFor(identity) },
  }
}

export interface MockServerOptions {
  /** Makes the world the demo's: documents with their text, tabs that share them and people who write in some. */
  demo?: DemoOptions
}

export function createMockServer({ demo }: MockServerOptions = {}): MockServer {
  const world: World = createWorld()
  const demonstration = demo === undefined ? undefined : createDemo(demo)
  const collaboration = new SimulatedCollabServer({
    authorize: (documentName, identity) => accessTo(world, documentName, identity),
    ...(demonstration === undefined ? {} : { initialContent: (name: string) => demonstration.initialContent(name) }),
  })
  demonstration?.start(collaboration)
  return {
    collaboration,
    // Loaded when it is asked for: it brings the collaboration session, which the first render of the demo does not need.
    addPeople: async (documentId, names) => {
      const { joinDocument } = await import('./collab/presence.ts')
      return joinDocument(world, collaboration, documentId, names)
    },
    connect({ signedInAs } = {}) {
      const person = signedInAs === undefined ? undefined : world.people.find((row) => row.email === signedInAs)
      if (signedInAs !== undefined && person === undefined) throw new Error(`The mock has no account for ${signedInAs}`)
      const session: Session = { userId: person?.id ?? null }
      const identity = person === undefined ? null : { userId: person.id, displayName: person.name ?? person.email }
      const startContent = (documentId: string, update: Uint8Array) =>
        Y.applyUpdate(collaboration.document(documentName(documentId)), update)
      const live = {
        state: (documentId: string) => Y.encodeStateAsUpdate(collaboration.document(documentName(documentId))),
        replace: (documentId: string, update: Uint8Array) =>
          replaceLiveContent(collaboration.document(documentName(documentId)), update),
      }
      return operationsOf({ world, session, startContent, live }, collaboration, identity)
    },
  }
}

/**
 * Only the build for the static demo is the demo (`vite build --mode production` with the mock, which `build:demo` makes):
 * the mocked end-to-end suite builds in its own mode and keeps empty documents and nobody else in them. The comparison is
 * between literals, so the mode alone decides.
 */
const isDemoBuild = import.meta.env.MODE === 'production'

/**
 * A mock with a single person on it, the way the app uses it: the demo starts with Marta Ruiz signed in. The page has
 * one browser and so nobody else, which a layout test needs: `window.draftroomMock.addPeople(documentId, names)` puts
 * people in a document. It is here, in the mock, and so in no build for the real API.
 */
export function createMockDataSource({ signedInAs = marta.email }: ConnectOptions = {}): DataSource {
  const server = createMockServer({
    ...(isDemoBuild ? { demo: { locale: resolveLocale(readStoredLocale(), navigator.languages) } } : {}),
  })
  if (typeof window !== 'undefined') Reflect.set(window, 'draftroomMock', { addPeople: server.addPeople })
  return server.connect({ signedInAs })
}
