import { sql, type ColumnDefinitionBuilder, type Kysely } from 'kysely'

// The history of a workspace: what people did to documents, one row per event, appended and never changed.
//
// The table has the shape of the contract's `ActivityEvent`, and its kinds are the contract's list, so the tasks that
// bring the other events (comments, sharing, versions) add rows and no migration. The document is referenced through
// `(workspace_id, id)` like every other table of a workspace, and its events go with it when it is deleted for good.
// The people are referenced straight to `users`, not to memberships: someone who leaves the workspace keeps their
// place in the history, and deleting a person who acted is refused until a task decides what the history says of them.
// `actor_id` is null when the server acted (an automatic version).

const id = (column: ColumnDefinitionBuilder) => column.primaryKey().defaultTo(sql`gen_random_uuid()`)
const createdAt = (column: ColumnDefinitionBuilder) => column.notNull().defaultTo(sql`now()`)

const kinds = [
  'document.created',
  'document.renamed',
  'document.moved',
  'document.archived',
  'document.restored',
  'access.granted',
  'access.changed',
  'access.revoked',
  'general-access.changed',
  'thread.created',
  'thread.replied',
  'thread.resolved',
  'thread.reopened',
  'version.created',
  'version.restored',
]

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('activity_events')
    .addColumn('id', 'uuid', id)
    .addColumn('workspace_id', 'uuid', (column) => column.notNull())
    .addColumn('document_id', 'uuid', (column) => column.notNull())
    .addColumn('type', 'text', (column) => column.notNull())
    .addColumn('actor_id', 'uuid', (column) => column.references('users.id'))
    // The person an access change is about.
    .addColumn('target_user_id', 'uuid', (column) => column.references('users.id'))
    .addColumn('created_at', 'timestamptz', createdAt)
    .addForeignKeyConstraint(
      'activity_events_document_fkey',
      ['workspace_id', 'document_id'],
      'documents',
      ['workspace_id', 'id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    // Written out as literals: a check constraint cannot call code, and a test holds this list to the contract's.
    .addCheckConstraint('activity_events_type_valid', sql`type in (${sql.join(kinds.map((kind) => sql.lit(kind)))})`)
    .execute()
  // Serves the history of one document, and the cascade when the document goes.
  await db.schema
    .createIndex('activity_events_document_idx')
    .on('activity_events')
    .columns(['workspace_id', 'document_id', 'created_at', 'id'])
    .execute()
}
