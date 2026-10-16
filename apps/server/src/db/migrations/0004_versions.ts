import { sql, type ColumnDefinitionBuilder, type Kysely } from 'kysely'

// The versions of a document: full copies of its Yjs state that people can preview and restore.
//
// A version is a full update (`Y.encodeStateAsUpdate`) and not a Yjs snapshot, because turning a snapshot back into
// content needs a document that keeps what it deleted, and the server's documents do not (protocol §11.1, ADR 0007).
// Versions are independent: deleting one never changes another, and they go with their document.
//
// The table follows 0001: it carries `workspace_id`, and its reference to the document goes through
// `(workspace_id, id)`, so a version cannot hang from a document of another workspace. The person is referenced straight
// to `users`, as `activity_events` does: someone who leaves the workspace keeps what they saved.
//
// `kind` is the contract's list, written out as literals (a check constraint cannot call code, and a test holds the two
// together). `created_by` is null exactly when the server made the version on its own, which is what an automatic one is.
// A restore leaves two versions, one of what it replaced (`pre-restore`) and one of the result (`restore`), and both carry
// the id of the request: a retried restore writes the first one again instead of adding another, and asking twice for the
// same restore cannot leave two results, so the unique index below is what makes those retries safe.
//
// The automatic versions need to know, for a document nobody has open, whether its edits were already looked at. A store
// stamps `document_states.updated_at`; `versions_checked_at` holds the stamp the last look was made at, so the sweep
// that makes automatic versions takes up only the documents stored since (protocol §11.2).

const id = (column: ColumnDefinitionBuilder) => column.primaryKey().defaultTo(sql`gen_random_uuid()`)
const createdAt = (column: ColumnDefinitionBuilder) => column.notNull().defaultTo(sql`now()`)

const kinds = ['auto', 'manual', 'pre-restore', 'restore']

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('document_versions')
    .addColumn('id', 'uuid', id)
    .addColumn('workspace_id', 'uuid', (column) => column.notNull())
    .addColumn('document_id', 'uuid', (column) => column.notNull())
    .addColumn('state', 'bytea', (column) => column.notNull())
    .addColumn('kind', 'text', (column) => column.notNull())
    .addColumn('label', 'text')
    .addColumn('created_by', 'uuid', (column) => column.references('users.id'))
    .addColumn('restore_id', 'uuid')
    .addColumn('created_at', 'timestamptz', createdAt)
    .addUniqueConstraint('document_versions_workspace_id_id_key', ['workspace_id', 'id'])
    .addForeignKeyConstraint(
      'document_versions_document_fkey',
      ['workspace_id', 'document_id'],
      'documents',
      ['workspace_id', 'id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .addCheckConstraint('document_versions_kind_valid', sql`kind in (${sql.join(kinds.map((kind) => sql.lit(kind)))})`)
    // Counts code points, like the contract's `VersionLabel`.
    .addCheckConstraint('document_versions_label_length', sql`label is null or char_length(label) between 1 and 100`)
    .addCheckConstraint('document_versions_author_matches_kind', sql`(kind = 'auto') = (created_by is null)`)
    .addCheckConstraint(
      'document_versions_restore_id_matches_kind',
      sql`(kind in ('pre-restore', 'restore')) = (restore_id is not null)`,
    )
    .execute()
  // Serves the list of one document in the order the API gives it, newest first.
  await db.schema
    .createIndex('document_versions_document_idx')
    .on('document_versions')
    .columns(['workspace_id', 'document_id', 'created_at', 'id'])
    .execute()
  // One version of each kind for each restore.
  await sql`create unique index document_versions_restore_once_idx
    on document_versions (restore_id, kind) where restore_id is not null`.execute(db)

  await db.schema.alterTable('document_states').addColumn('versions_checked_at', 'timestamptz').execute()
}
