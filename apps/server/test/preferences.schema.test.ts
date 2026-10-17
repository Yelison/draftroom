import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Database } from '../src/db/tables.ts'
import { readContractDocument } from '../src/http/contract-document.ts'
import { provisionDatabase, type TestDatabase } from './support/postgres.ts'

// The preferences of an account hold the same promises as the rest of the schema (see `schema.test.ts`): what the API
// promises of a field is held by the database as well.

let database: TestDatabase
let db: Kysely<Database>
beforeAll(async () => {
  database = await provisionDatabase()
  db = database.db
})
afterAll(async () => {
  await database.drop()
})

const checkViolation = '23514'
const refusedBy = (constraint: string) => expect.objectContaining({ code: checkViolation, constraint })

const storedValues = async (constraint: string): Promise<string[]> => {
  const { rows } = await sql<{ definition: string }>`
    select pg_get_constraintdef(oid) as definition from pg_constraint where conname = ${constraint}`.execute(db)
  return [...(rows[0]?.definition.matchAll(/'([^']+)'/g) ?? [])].map((match) => match[1] ?? '')
}

const contractValues = (schema: string): string[] =>
  z.object({ enum: z.array(z.string()) }).parse(readContractDocument().components.schemas[schema]).enum

describe('the preferences of an account', () => {
  it('start with no language and a medium editor text', async () => {
    const { locale, editor_text_size } = await db
      .insertInto('users')
      .values({ email: 'marta@harborpine.example' })
      .returning(['locale', 'editor_text_size'])
      .executeTakeFirstOrThrow()

    expect({ locale, editor_text_size }).toEqual({ locale: null, editor_text_size: 'medium' })
  })

  it('offer the languages of the contract, so a language the API serves can always be stored', async () => {
    expect((await storedValues('users_locale_valid')).sort()).toEqual(contractValues('Locale').sort())
  })

  it('offer the text sizes of the contract, so a size the API serves can always be stored', async () => {
    expect((await storedValues('users_editor_text_size_valid')).sort()).toEqual(contractValues('EditorTextSize').sort())
  })

  it('refuse a language that is not in the list', async () => {
    await expect(
      sql`insert into users (email, locale) values ('a@harborpine.example', 'fr')`.execute(db),
    ).rejects.toEqual(refusedBy('users_locale_valid'))
  })

  it('refuse a text size that is not in the list, and no text size at all', async () => {
    await expect(
      sql`insert into users (email, editor_text_size) values ('b@harborpine.example', 'huge')`.execute(db),
    ).rejects.toEqual(refusedBy('users_editor_text_size_valid'))
    await expect(
      sql`insert into users (email, editor_text_size) values ('c@harborpine.example', null)`.execute(db),
    ).rejects.toEqual(expect.objectContaining({ code: '23502' }))
  })
})
