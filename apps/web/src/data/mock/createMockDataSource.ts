import type { DataSource } from '../DataSource.ts'
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
import { unhandled } from './unhandled.ts'
import { createWorld, type World } from './world.ts'

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
}

function operationsOf(ctx: Context): DataSource {
  return {
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
    getVersionContent: unhandled('getVersionContent'),
  }
}

export function createMockServer(): MockServer {
  const world: World = createWorld()
  return {
    connect({ signedInAs } = {}) {
      const person = signedInAs === undefined ? undefined : world.people.find((row) => row.email === signedInAs)
      if (signedInAs !== undefined && person === undefined) throw new Error(`The mock has no account for ${signedInAs}`)
      const session: Session = { userId: person?.id ?? null }
      return operationsOf({ world, session })
    },
  }
}

/** A mock with a single person on it, the way the app uses it: the demo starts with Marta Ruiz signed in. */
export function createMockDataSource({ signedInAs = marta.email }: ConnectOptions = {}): DataSource {
  return createMockServer().connect({ signedInAs })
}
