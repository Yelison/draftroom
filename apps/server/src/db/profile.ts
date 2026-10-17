import type { Schema } from '@draftroom/contract'
import type { Kysely, Updateable } from 'kysely'
import type { Database, EditorTextSize, Locale, UsersTable } from './tables.ts'

/** A person with the preferences saved on their account. `name` is null only for a member who has not signed up. */
export interface ProfileRow {
  readonly id: string
  readonly email: string
  readonly name: string | null
  readonly locale: Locale | null
  readonly editorTextSize: EditorTextSize
}

/** What a person can change of their own account; a field that is left out keeps its value. */
export type ProfileChanges = Schema<'UpdateMeRequest'>

const profileColumns = ['id', 'email', 'name', 'locale', 'editor_text_size as editorTextSize'] as const

export function findProfile(db: Kysely<Database>, userId: string): Promise<ProfileRow | undefined> {
  return db.selectFrom('users').select(profileColumns).where('id', '=', userId).executeTakeFirst()
}

/**
 * Writes the fields that came and answers the account as it is now, or nothing when the person is not there. A member
 * who has not signed up has no account to change, so nothing is written for them.
 */
export function updateProfile(
  db: Kysely<Database>,
  userId: string,
  { name, locale, editorTextSize }: ProfileChanges,
): Promise<ProfileRow | undefined> {
  const values: Updateable<UsersTable> = {
    ...(name !== undefined && { name }),
    ...(locale !== undefined && { locale }),
    ...(editorTextSize !== undefined && { editor_text_size: editorTextSize }),
  }
  return db
    .updateTable('users')
    .set(values)
    .where('id', '=', userId)
    .where('signed_up_at', 'is not', null)
    .returning(profileColumns)
    .executeTakeFirst()
}
