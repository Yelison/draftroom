import type { ActivityRecord, ThreadRecord, VersionRecord } from './fixtures/collaboration.ts'
import type { DocumentRecord, GrantRecord, PinRecord } from './fixtures/documents.ts'
import { seed, seedNow } from './fixtures/index.ts'
import type { PersonRecord } from './fixtures/people.ts'
import type { TemplateRecord } from './fixtures/templates.ts'
import type { FolderRecord, MembershipRecord, WorkspaceRecord } from './fixtures/workspaces.ts'
import { createIdGenerator } from './ids.ts'
import { versionContent } from './fixtures/versionContent.ts'
// The mock plays the server, which stores versions as Yjs updates and so may build them.
// oxlint-disable-next-line no-restricted-imports
import { jsonToYUpdate } from '@draftroom/editor-schema/convert'

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
  /** The Yjs update each version holds, by version id: what the server keeps next to the row. */
  versionContent: Map<string, Uint8Array>
  activity: ActivityRecord[]
  templates: readonly TemplateRecord[]
}

export function createWorld(): World {
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
    versionContent: new Map(
      Object.entries(versionContent).map(([versionId, json]) => [versionId, jsonToYUpdate(json)]),
    ),
    activity: seed.activity.map((row) => ({ ...row })),
    templates: seed.templates,
  }
}
