import { randomUUID } from 'node:crypto'
import { sql, type Insertable, type Kysely } from 'kysely'
import { z } from 'zod'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database, DocumentVersionsTable } from '../src/db/tables.ts'
import { readContractDocument } from '../src/http/contract-document.ts'
import { createPopulatedWorkspace, type Workspace } from './support/fixtures.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'

// The table of versions holds the same promises as the rest of the schema (see `schema.test.ts`): a version cannot point
// at a document of another workspace, and what the API promises of its fields is held by the database as well.

let database: TestDatabase
let db: Kysely<Database>
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
})
afterAll(async () => {
  await database.drop()
})

const foreignKeyViolation = '23503'
const uniqueViolation = '23505'
const checkViolation = '23514'
const refusedBy = (code: string, constraint: string) => expect.objectContaining({ code, constraint })

let a: Workspace
let b: Workspace
beforeAll(async () => {
  a = await createPopulatedWorkspace(db)
  b = await createPopulatedWorkspace(db)
})

const newVersion = (changes: Partial<Insertable<DocumentVersionsTable>> = {}) =>
  db
    .insertInto('document_versions')
    .values({
      workspace_id: a.id,
      document_id: a.documentId,
      state: Uint8Array.of(0, 0),
      kind: 'manual',
      created_by: a.userId,
      ...changes,
    })
    .execute()

describe('a version that points at another workspace', () => {
  it('is accepted inside the workspace, which is what makes the refusal below mean something', async () => {
    await expect(newVersion()).resolves.toBeDefined()
  })

  it('is refused for a document of another workspace', async () => {
    await expect(newVersion({ workspace_id: b.id })).rejects.toEqual(
      refusedBy(foreignKeyViolation, 'document_versions_document_fkey'),
    )
  })
})

describe('what goes when something else goes', () => {
  it('removes the versions of a deleted document', async () => {
    const workspace = await createPopulatedWorkspace(db)
    await newVersion({ workspace_id: workspace.id, document_id: workspace.documentId, created_by: workspace.userId })

    await db.deleteFrom('documents').where('id', '=', workspace.documentId).execute()

    expect(
      await db.selectFrom('document_versions').select('id').where('document_id', '=', workspace.documentId).execute(),
    ).toEqual([])
  })
})

describe('the kinds of version', () => {
  it('are exactly the contract list, so a version the API serves can always be stored', async () => {
    const { rows } = await sql<{ definition: string }>`
      select pg_get_constraintdef(oid) as definition from pg_constraint
      where conname = 'document_versions_kind_valid'`.execute(db)

    const stored = [...(rows[0]?.definition.matchAll(/'([^']+)'/g) ?? [])].map((match) => match[1])
    const contract = z
      .object({ enum: z.array(z.string()) })
      .parse(readContractDocument().components.schemas['VersionKind'])
    expect(stored.sort()).toEqual(contract.enum.sort())
  })

  it('refuse a kind that is not in the list', async () => {
    // @ts-expect-error `snapshot` is not a kind: the database has to refuse it all the same
    await expect(newVersion({ kind: 'snapshot' })).rejects.toEqual(
      refusedBy(checkViolation, 'document_versions_kind_valid'),
    )
  })
})

describe('who made a version', () => {
  it('is nobody for an automatic version, which the server makes', async () => {
    await expect(newVersion({ kind: 'auto', created_by: null })).resolves.toBeDefined()
  })

  it('is refused for an automatic version that names a person', async () => {
    await expect(newVersion({ kind: 'auto' })).rejects.toEqual(
      refusedBy(checkViolation, 'document_versions_author_matches_kind'),
    )
  })

  it('is refused for a version a person asked for that names nobody', async () => {
    await expect(newVersion({ kind: 'manual', created_by: null })).rejects.toEqual(
      refusedBy(checkViolation, 'document_versions_author_matches_kind'),
    )
  })
})

describe('the label of a version', () => {
  it('counts code points like the contract: a hundred emoji fit and a hundred and one do not', async () => {
    await expect(newVersion({ label: '😀'.repeat(100) })).resolves.toBeDefined()
    await expect(newVersion({ label: '😀'.repeat(101) })).rejects.toEqual(
      refusedBy(checkViolation, 'document_versions_label_length'),
    )
  })

  it('is never empty: no label is null', async () => {
    await expect(newVersion({ label: '' })).rejects.toEqual(refusedBy(checkViolation, 'document_versions_label_length'))
  })
})

describe('the versions of one restore', () => {
  const restoreId = () => randomUUID()

  it('are a pre-restore version and a restore version, and each exists once for a restore', async () => {
    const id = restoreId()
    await newVersion({ kind: 'pre-restore', restore_id: id })
    await newVersion({ kind: 'restore', restore_id: id })

    await expect(newVersion({ kind: 'pre-restore', restore_id: id })).rejects.toEqual(
      refusedBy(uniqueViolation, 'document_versions_restore_once_idx'),
    )
    await expect(newVersion({ kind: 'restore', restore_id: id })).rejects.toEqual(
      refusedBy(uniqueViolation, 'document_versions_restore_once_idx'),
    )
  })

  it('are the only versions that carry a restore id', async () => {
    await expect(newVersion({ kind: 'manual', restore_id: restoreId() })).rejects.toEqual(
      refusedBy(checkViolation, 'document_versions_restore_id_matches_kind'),
    )
    await expect(newVersion({ kind: 'restore', restore_id: null })).rejects.toEqual(
      refusedBy(checkViolation, 'document_versions_restore_id_matches_kind'),
    )
  })
})
