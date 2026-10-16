import type { Kysely } from 'kysely'
import type { Database, DocumentRole, GeneralAccess } from '../../src/db/tables.ts'
import { createPerson, createWorkspace, grant, join, type Person } from './world.ts'

// Every way a person can come to have a role on a document, and the role that results: the rows of the access matrix
// are tried against each of them, because a rule that holds for an explicit grant may not hold for general access.

export interface Arrangement {
  readonly db: Kysely<Database>
  readonly workspaceId: string
  readonly documentId: string
  /** The person whose access is being set up. */
  readonly subject: Person
}

export interface Scenario {
  readonly name: string
  /** The effective role, or `null` for someone who cannot even know the document exists. */
  readonly role: DocumentRole | null
  arrange(arrangement: Arrangement): Promise<void>
}

const withGeneralAccess = async ({ db, documentId }: Arrangement, access: GeneralAccess): Promise<void> => {
  await db.updateTable('documents').set({ general_access: access }).where('id', '=', documentId).execute()
}

const explicit = (role: DocumentRole): Scenario => ({
  name: `explicit ${role} grant`,
  role,
  async arrange(arrangement) {
    await join(arrangement.db, arrangement.workspaceId, arrangement.subject)
    await grant(arrangement.db, { ...arrangement, person: arrangement.subject, role })
  },
})

const general = (access: Exclude<GeneralAccess, 'none'>): Scenario => ({
  name: `general access ${access}`,
  role: access,
  async arrange(arrangement) {
    await join(arrangement.db, arrangement.workspaceId, arrangement.subject)
    await withGeneralAccess(arrangement, access)
  },
})

export const scenarios: readonly Scenario[] = [
  {
    name: 'workspace owner without a grant',
    role: 'owner',
    arrange: ({ db, workspaceId, subject }) => join(db, workspaceId, subject, 'owner'),
  },
  explicit('owner'),
  explicit('editor'),
  explicit('commenter'),
  explicit('viewer'),
  general('editor'),
  general('commenter'),
  general('viewer'),
  {
    name: 'viewer grant raised by general access editor',
    role: 'editor',
    async arrange(arrangement) {
      await explicit('viewer').arrange(arrangement)
      await withGeneralAccess(arrangement, 'editor')
    },
  },
  {
    name: 'editor grant under general access viewer',
    role: 'editor',
    async arrange(arrangement) {
      await explicit('editor').arrange(arrangement)
      await withGeneralAccess(arrangement, 'viewer')
    },
  },
  {
    name: 'member with no grant and no general access',
    role: null,
    arrange: ({ db, workspaceId, subject }) => join(db, workspaceId, subject),
  },
  {
    name: 'person outside the workspace',
    role: null,
    arrange: async () => undefined,
  },
  {
    name: 'member of another workspace only',
    role: null,
    async arrange({ db, subject }) {
      await join(db, await createWorkspace(db, 'Almazara'), subject)
    },
  },
]

/** A person for a test, with a name that says which scenario they are. */
export const personFor = (db: Kysely<Database>, scenario: Scenario): Promise<Person> =>
  createPerson(db, scenario.name.slice(0, 80))
