import type { ActivityRecord, ThreadRecord, VersionRecord } from './fixtures/collaboration.ts'
import type { DocumentRecord, GrantRecord, PinRecord } from './fixtures/documents.ts'
import type { JSONContent } from '@tiptap/core'
import { fixtures, seedNow, type Fixtures } from './fixtures/index.ts'
import type { PersonRecord } from './fixtures/people.ts'
import type { TemplateRecord } from './fixtures/templates.ts'
import type { FolderRecord, MembershipRecord, WorkspaceRecord } from './fixtures/workspaces.ts'
import { createIdGenerator } from './ids.ts'

/**
 * The state of one mock server: every table the contract's resources live in. It is built from the fixtures when the
 * mock is created and copied, never shared, so what a test or a screen changes is gone with the instance.
 */
export interface World {
  /** The next instant: it never repeats and only grows, so two changes never tie and the order is the order they happened in. */
  now(): string
  newId(): string
  people: PersonRecord[]
  workspaces: WorkspaceRecord[]
  memberships: MembershipRecord[]
  folders: FolderRecord[]
  documents: DocumentRecord[]
  grants: GrantRecord[]
  pins: PinRecord[]
  threads: ThreadRecord[]
  versions: VersionRecord[]
  /** The Yjs update of the versions made after the fixtures, by version id: the fixtures' own text is in `fixtures/versionContent.ts`. */
  versionContent: Map<string, Uint8Array>
  /** What the stored versions of the fixtures held, by version id. */
  fixtureVersionContent: Readonly<Record<string, JSONContent>>
  activity: ActivityRecord[]
  templates: readonly TemplateRecord[]
}

/** A world starts from `source`, which is the fixtures of the tests unless the demo gives it its own. */
export function createWorld({ seed, versionContent }: Fixtures = fixtures): World {
  let instant = Date.parse(seedNow)
  return {
    now() {
      instant += 1000
      return new Date(instant).toISOString()
    },
    newId: createIdGenerator(),
    people: seed.people.map((row) => ({ ...row })),
    workspaces: seed.workspaces.map((row) => ({ ...row })),
    memberships: seed.memberships.map((row) => ({ ...row })),
    folders: seed.folders.map((row) => ({ ...row })),
    documents: seed.documents.map((row) => ({ ...row })),
    grants: seed.grants.map((row) => ({ ...row })),
    pins: seed.pins.map((row) => ({ ...row })),
    threads: seed.threads.map((row) => ({
      ...row,
      anchor: { ...row.anchor },
      comments: row.comments.map((comment) => ({ ...comment })),
    })),
    versions: seed.versions.map((row) => ({ ...row })),
    versionContent: new Map(),
    fixtureVersionContent: versionContent,
    activity: seed.activity.map((row) => ({ ...row })),
    templates: seed.templates,
  }
}
