import { sql, type Kysely } from 'kysely'

// A session now ends for two reasons: its absolute lifetime (`expires_at`, in `0001`) and a stretch without use. The second
// needs to know when the session was last used, and the sweep that ends expired sessions finds the idle ones by it, so it
// is indexed beside `expires_at`: a sweep reads the few sessions that ended, through the two indexes, and not the table.
// `0001` made the sessions table; this adds only what that rule needs. The default gives a session that was already open
// the moment of the migration, so migrating does not sign anyone out.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('sessions')
    .addColumn('last_seen_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute()
  await db.schema.createIndex('sessions_last_seen_at_idx').on('sessions').column('last_seen_at').execute()
}
