import { sql, type Kysely } from 'kysely'

// What a person saves on their account: the language the app opens in and the size of the text in the editor.
//
// `locale` is null until the person chooses: it means "no preference", and the browser's language applies. A default of
// `en` would force the language of everyone who never chose one, because the account's language takes precedence over the
// browser's. `editor_text_size` always has a value: `medium` is the size every document has been shown in so far.
//
// Both lists are the contract's, written out as literals (a check constraint cannot call code, and a test holds the two
// together).

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('locale', 'text')
    .addColumn('editor_text_size', 'text', (column) => column.notNull().defaultTo('medium'))
    .execute()
  await db.schema
    .alterTable('users')
    .addCheckConstraint('users_locale_valid', sql`locale is null or locale in ('en', 'es')`)
    .execute()
  await db.schema
    .alterTable('users')
    .addCheckConstraint('users_editor_text_size_valid', sql`editor_text_size in ('small', 'medium', 'large')`)
    .execute()
}
