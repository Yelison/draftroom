import type { JSONContent } from '@tiptap/core'
import { activity, threads, versions } from './collaboration.ts'
import { documents, grants, pins } from './documents.ts'
import { people } from './people.ts'
import { templates } from './templates.ts'
import { versionContent } from './versionContent.ts'
import { folders, memberships, workspaces } from './workspaces.ts'

export { demoPassword, marta, daniel, sofia, wei, ana } from './people.ts'
export { harborPine, lanternStudio } from './workspaces.ts'

/** Everything a fresh mock starts with. A mock copies it, so no instance ever changes what the next one starts from. */
export const seed = {
  people,
  workspaces,
  memberships,
  folders,
  documents,
  grants,
  pins,
  threads,
  versions,
  activity,
  templates,
}

export type Seed = typeof seed

/** What a mock world starts from: its tables, and the text that each stored version of them held. */
export interface Fixtures {
  seed: Seed
  versionContent: Readonly<Record<string, JSONContent>>
}

/** The fixtures of the tests: documents in English and Spanish side by side, and the versions in English. */
export const fixtures: Fixtures = { seed, versionContent }

/** The instant the demo calls "now": a little after its latest change, so what people do next sorts first. */
export const seedNow = '2026-10-13T09:00:00.000Z'
