import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../src/db/tables.ts'
import { addMember, createDocument, createPopulatedWorkspace, createUser, type Workspace } from './support/fixtures.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'

let database: TestDatabase
let db: Kysely<Database>
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
})
afterAll(async () => {
  await database.drop()
})

// PostgreSQL's own codes, so a test says which rule refused the row and not just that something did.
const foreignKeyViolation = '23503'
const checkViolation = '23514'
const notNullViolation = '23502'
const uniqueViolation = '23505'

const refusedBy = (code: string, constraint?: string) =>
  expect.objectContaining({ code, ...(constraint === undefined ? {} : { constraint }) })

describe('a reference to another workspace', () => {
  let a: Workspace
  let b: Workspace
  beforeAll(async () => {
    a = await createPopulatedWorkspace(db)
    b = await createPopulatedWorkspace(db)
  })

  it('is accepted inside the workspace, which is what makes the refusals below mean something', async () => {
    const pending = await createUser(db, null)
    await addMember(db, a.id, pending)

    const insertInside = async (): Promise<void> => {
      const inside = await createDocument(db, { workspaceId: a.id, createdBy: a.userId, folderId: a.folderId })
      await db
        .insertInto('document_states')
        .values({ workspace_id: a.id, document_id: inside, state: new Uint8Array([0, 0]) })
        .execute()
      // A member who has not signed up yet can already be granted access: that is what a pending member is for.
      await db
        .insertInto('document_access')
        .values({ workspace_id: a.id, document_id: inside, user_id: pending, role: 'editor' })
        .execute()
      await db.insertInto('pins').values({ workspace_id: a.id, document_id: inside, user_id: a.userId }).execute()
    }

    await expect(insertInside()).resolves.toBeUndefined()
  })

  const refusals: readonly (readonly [string, (a: Workspace, b: Workspace) => Promise<unknown>, string])[] = [
    [
      'a document in a folder of another workspace',
      (a, b) =>
        db
          .insertInto('documents')
          .values({ workspace_id: b.id, created_by: b.userId, folder_id: a.folderId, title: 'Plan', archived_at: null })
          .execute(),
      'documents_folder_fkey',
    ],
    [
      'a grant on a document of another workspace',
      (a, b) =>
        db
          .insertInto('document_access')
          .values({ workspace_id: b.id, document_id: a.documentId, user_id: b.userId, role: 'viewer' })
          .execute(),
      'document_access_document_fkey',
    ],
    [
      'a grant to a person who is not a member of the workspace',
      (a, b) =>
        db
          .insertInto('document_access')
          .values({ workspace_id: b.id, document_id: b.documentId, user_id: a.userId, role: 'viewer' })
          .execute(),
      'document_access_member_fkey',
    ],
    [
      'the content of a document of another workspace',
      (a, b) =>
        db
          .insertInto('document_states')
          .values({ workspace_id: b.id, document_id: a.documentId, state: new Uint8Array([0, 0]) })
          .execute(),
      'document_states_document_fkey',
    ],
    [
      'a pin on a document of another workspace',
      (a, b) =>
        db.insertInto('pins').values({ workspace_id: b.id, document_id: a.documentId, user_id: b.userId }).execute(),
      'pins_document_fkey',
    ],
    [
      'a pin by a person who is not a member of the workspace',
      (a, b) =>
        db.insertInto('pins').values({ workspace_id: b.id, document_id: b.documentId, user_id: a.userId }).execute(),
      'pins_member_fkey',
    ],
  ]

  it.each(refusals)('is refused by the database: %s', async (_name, attempt, constraint) => {
    await expect(attempt(a, b)).rejects.toEqual(refusedBy(foreignKeyViolation, constraint))
  })
})

describe('removing rows that others hang from', () => {
  it('removes the grants and pins of a member who leaves the workspace', async () => {
    const workspace = await createPopulatedWorkspace(db)
    const member = await createUser(db)
    await addMember(db, workspace.id, member)
    await db
      .insertInto('document_access')
      .values({ workspace_id: workspace.id, document_id: workspace.documentId, user_id: member, role: 'editor' })
      .execute()
    await db
      .insertInto('pins')
      .values({ workspace_id: workspace.id, document_id: workspace.documentId, user_id: member })
      .execute()

    await db.deleteFrom('memberships').where('workspace_id', '=', workspace.id).where('user_id', '=', member).execute()

    const grants = await db.selectFrom('document_access').select('user_id').where('user_id', '=', member).execute()
    const pins = await db.selectFrom('pins').select('user_id').where('user_id', '=', member).execute()
    expect([grants, pins]).toEqual([[], []])
  })

  it('removes the content, grants and pins of a deleted document', async () => {
    const workspace = await createPopulatedWorkspace(db)
    await db
      .insertInto('document_states')
      .values({ workspace_id: workspace.id, document_id: workspace.documentId, state: new Uint8Array([0, 0]) })
      .execute()
    await db
      .insertInto('document_access')
      .values({
        workspace_id: workspace.id,
        document_id: workspace.documentId,
        user_id: workspace.userId,
        role: 'owner',
      })
      .execute()

    await db.deleteFrom('documents').where('id', '=', workspace.documentId).execute()

    const states = await db
      .selectFrom('document_states')
      .select('document_id')
      .where('document_id', '=', workspace.documentId)
      .execute()
    const grants = await db
      .selectFrom('document_access')
      .select('document_id')
      .where('document_id', '=', workspace.documentId)
      .execute()
    expect([states, grants]).toEqual([[], []])
  })

  it('refuses to delete a folder that still holds a document', async () => {
    const workspace = await createPopulatedWorkspace(db)

    await expect(db.deleteFrom('folders').where('id', '=', workspace.folderId).execute()).rejects.toEqual(
      refusedBy(foreignKeyViolation, 'documents_folder_fkey'),
    )
  })
})

describe('the rules of a row', () => {
  let workspace: Workspace
  beforeAll(async () => {
    workspace = await createPopulatedWorkspace(db)
  })

  const newDocument = (changes: { title?: string; revision?: number; excerpt?: string }) =>
    db
      .insertInto('documents')
      .values({
        workspace_id: workspace.id,
        created_by: workspace.userId,
        title: 'Plan',
        archived_at: null,
        ...changes,
      })
      .execute()

  it('counts a title in code points, as the contract does: 200 emoji fit, 201 do not', async () => {
    await expect(newDocument({ title: '😀'.repeat(200) })).resolves.toBeDefined()
    await expect(newDocument({ title: '😀'.repeat(201) })).rejects.toEqual(
      refusedBy(checkViolation, 'documents_title_length'),
    )
  })

  // Raw SQL for the values the table types forbid: the database has to refuse them even when the application does not.
  const refusedRows: readonly (readonly [string, () => Promise<unknown>, unknown])[] = [
    ['an empty title', () => newDocument({ title: '' }), refusedBy(checkViolation, 'documents_title_length')],
    [
      'an excerpt over 300 characters',
      () => newDocument({ excerpt: 'a'.repeat(301) }),
      refusedBy(checkViolation, 'documents_excerpt_length'),
    ],
    [
      'a revision below 1',
      () => newDocument({ revision: 0 }),
      refusedBy(checkViolation, 'documents_revision_positive'),
    ],
    [
      'a general access that is not one of the four',
      () => sql`update documents set general_access = 'public' where id = ${workspace.documentId}`.execute(db),
      refusedBy(checkViolation, 'documents_general_access_valid'),
    ],
    [
      'a workspace role that does not exist',
      async () =>
        sql`insert into memberships (workspace_id, user_id, role) values (${workspace.id}, ${await createUser(db)}, 'admin')`.execute(
          db,
        ),
      refusedBy(checkViolation, 'memberships_role_valid'),
    ],
    [
      'a document role that does not exist',
      () =>
        sql`insert into document_access (workspace_id, document_id, user_id, role)
            values (${workspace.id}, ${workspace.documentId}, ${workspace.userId}, 'admin')`.execute(db),
      refusedBy(checkViolation, 'document_access_role_valid'),
    ],
    [
      'a workspace name over 80 characters',
      () =>
        db
          .insertInto('workspaces')
          .values({ name: 'a'.repeat(81) })
          .execute(),
      refusedBy(checkViolation, 'workspaces_name_length'),
    ],
    [
      'a folder with a revision below 1',
      () => db.insertInto('folders').values({ workspace_id: workspace.id, name: 'Launch', revision: 0 }).execute(),
      refusedBy(checkViolation, 'folders_revision_positive'),
    ],
    [
      'a document without content bytes',
      () =>
        sql`insert into document_states (workspace_id, document_id, state) values (${workspace.id}, ${workspace.documentId}, null)`.execute(
          db,
        ),
      expect.objectContaining({ code: notNullViolation, column: 'state' }),
    ],
  ]

  it.each(refusedRows)('refuses %s', async (_name, attempt, refusal) => {
    await expect(attempt()).rejects.toEqual(refusal)
  })

  it('refuses a person who is a duplicate of another by email, whatever the case', async () => {
    const email = `Marta.${Date.now()}@Harborpine.example`
    await db.insertInto('users').values({ email, name: 'Marta Ruiz', signed_up_at: new Date() }).execute()

    await expect(
      db
        .insertInto('users')
        .values({ email: email.toLowerCase(), name: 'Marta R.', signed_up_at: new Date() })
        .execute(),
    ).rejects.toEqual(refusedBy(uniqueViolation, 'users_email_lower_key'))
  })

  it('refuses a name on a person who never signed up, and a missing one on a person who did', async () => {
    const insert = (name: string | null, signedUpAt: Date | null) =>
      db
        .insertInto('users')
        .values({ email: `${crypto.randomUUID()}@harborpine.example`, name, signed_up_at: signedUpAt })
        .execute()

    await expect(insert('Marta Ruiz', null)).rejects.toEqual(refusedBy(checkViolation, 'users_name_iff_signed_up'))
    await expect(insert(null, new Date())).rejects.toEqual(refusedBy(checkViolation, 'users_name_iff_signed_up'))
    await expect(insert(null, null)).resolves.toBeDefined()
  })

  it('refuses a member twice in the same workspace', async () => {
    await expect(addMember(db, workspace.id, workspace.userId)).rejects.toEqual(
      refusedBy(uniqueViolation, 'memberships_pkey'),
    )
  })

  it('refuses the same person twice on one document', async () => {
    const grant = () =>
      db
        .insertInto('document_access')
        .values({
          workspace_id: workspace.id,
          document_id: workspace.documentId,
          user_id: workspace.userId,
          role: 'owner',
        })
        .execute()
    await grant()

    await expect(grant()).rejects.toEqual(refusedBy(uniqueViolation, 'document_access_pkey'))
  })

  it('shares nothing by default', async () => {
    const { general_access, revision, archived_at } = await db
      .selectFrom('documents')
      .select(['general_access', 'revision', 'archived_at'])
      .where('id', '=', workspace.documentId)
      .executeTakeFirstOrThrow()

    expect({ general_access, revision, archived_at }).toEqual({
      general_access: 'none',
      revision: 1,
      archived_at: null,
    })
  })
})

describe('the shape of the schema', () => {
  it('gives every table a created_at that cannot be null', async () => {
    const { rows } = await sql<{ table_name: string }>`
      select t.table_name from information_schema.tables t
      where t.table_schema = 'public' and t.table_name not like 'kysely_%'
        and not exists (
          select 1 from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = t.table_name
            and c.column_name = 'created_at' and c.is_nullable = 'NO' and c.data_type = 'timestamp with time zone')`.execute(
      db,
    )

    expect(rows).toEqual([])
  })

  it('makes every reference from a table of a workspace go through the workspace', async () => {
    // A reference that left out workspace_id could point at a row of another workspace. The two exceptions are the
    // workspace itself and people, who belong to no workspace.
    const { rows } = await sql<{ constraint_name: string }>`
      select con.conname as constraint_name
      from pg_constraint con
      join pg_class owner on owner.oid = con.conrelid
      join pg_class target on target.oid = con.confrelid
      join pg_namespace ns on ns.oid = owner.relnamespace
      where con.contype = 'f' and ns.nspname = 'public'
        and exists (select 1 from pg_attribute a where a.attrelid = owner.oid and a.attname = 'workspace_id' and not a.attisdropped)
        and target.relname not in ('workspaces', 'users')
        and not exists (
          select 1 from pg_attribute a
          where a.attrelid = owner.oid and a.attnum = any (con.conkey) and a.attname = 'workspace_id')`.execute(db)

    expect(rows).toEqual([])
  })
})
