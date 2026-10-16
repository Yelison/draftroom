import { sql, type ColumnDefinitionBuilder, type Kysely } from 'kysely'

// The comments of a document: threads anchored to a range of its text, and the comments each thread holds.
//
// A thread keeps the anchor exactly as the client sent it, two encoded relative positions, and the quote the range
// covered; the server never decodes either (protocol §10), so the columns are opaque text and the checks only repeat the
// shape the contract already requires. Whether a thread is open is not a column of its own: `resolved_at` and
// `resolved_by` are both set or both null, and a thread is resolved when they are set.
//
// Both tables follow 0001: each carries `workspace_id`, and every reference goes through `(workspace_id, id)`, so a
// thread cannot hang from a document of another workspace, nor a comment from a thread of one. The people are
// referenced straight to `users`, as `activity_events` does: someone who leaves the workspace keeps what they wrote.
// A thread goes with its document, and its comments with it. A thread whose last comment is deleted is deleted by the
// application, which locks the thread row to do it: the database cannot say "not empty" in a constraint.
// Lengths use `char_length`, which counts code points like the contract does.

const id = (column: ColumnDefinitionBuilder) => column.primaryKey().defaultTo(sql`gen_random_uuid()`)
const createdAt = (column: ColumnDefinitionBuilder) => column.notNull().defaultTo(sql`now()`)

// The shape of an anchor end: base64. The contract (and the protocol) allow 128 characters; the database allows twice that,
// so that a limit that is revised never needs a migration, and the API is the one that holds the line.
const positionValid = (column: string) =>
  sql`char_length(${sql.ref(column)}) <= 256 and ${sql.ref(column)} ~ '^[A-Za-z0-9+/]+={0,2}$'`

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('threads')
    .addColumn('id', 'uuid', id)
    .addColumn('workspace_id', 'uuid', (column) => column.notNull())
    .addColumn('document_id', 'uuid', (column) => column.notNull())
    .addColumn('anchor_start', 'text', (column) => column.notNull())
    .addColumn('anchor_end', 'text', (column) => column.notNull())
    .addColumn('quote', 'text', (column) => column.notNull())
    .addColumn('created_by', 'uuid', (column) => column.notNull().references('users.id'))
    .addColumn('created_at', 'timestamptz', createdAt)
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('resolved_by', 'uuid', (column) => column.references('users.id'))
    .addUniqueConstraint('threads_workspace_id_id_key', ['workspace_id', 'id'])
    .addForeignKeyConstraint(
      'threads_document_fkey',
      ['workspace_id', 'document_id'],
      'documents',
      ['workspace_id', 'id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .addCheckConstraint('threads_anchor_start_valid', positionValid('anchor_start'))
    .addCheckConstraint('threads_anchor_end_valid', positionValid('anchor_end'))
    .addCheckConstraint('threads_quote_length', sql`char_length(quote) between 1 and 500`)
    .addCheckConstraint('threads_resolved_together', sql`(resolved_at is null) = (resolved_by is null)`)
    .execute()
  // Serves the threads of one document in the order the API lists them.
  await db.schema
    .createIndex('threads_document_idx')
    .on('threads')
    .columns(['workspace_id', 'document_id', 'created_at', 'id'])
    .execute()

  await db.schema
    .createTable('comments')
    .addColumn('id', 'uuid', id)
    .addColumn('workspace_id', 'uuid', (column) => column.notNull())
    .addColumn('thread_id', 'uuid', (column) => column.notNull())
    .addColumn('author_id', 'uuid', (column) => column.notNull().references('users.id'))
    .addColumn('body', 'text', (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', createdAt)
    .addColumn('updated_at', 'timestamptz', createdAt)
    .addForeignKeyConstraint(
      'comments_thread_fkey',
      ['workspace_id', 'thread_id'],
      'threads',
      ['workspace_id', 'id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .addCheckConstraint('comments_body_length', sql`char_length(body) between 1 and 5000`)
    .execute()
  // Serves the comments of a thread in the order the API lists them, and the cascade when the thread goes.
  await db.schema
    .createIndex('comments_thread_idx')
    .on('comments')
    .columns(['workspace_id', 'thread_id', 'created_at', 'id'])
    .execute()
}
