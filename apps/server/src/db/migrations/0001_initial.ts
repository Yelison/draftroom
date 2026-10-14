import { sql, type ColumnDefinitionBuilder, type Kysely } from 'kysely'

// The first schema: people and sessions, workspaces with their members, folders, documents, who can open them,
// their binary content and the personal pins.
//
// Every table that belongs to a workspace carries `workspace_id`, and every reference between two of them goes through
// `(workspace_id, id)`. A row can therefore never point at a folder, a document or a member of another workspace:
// the database refuses it, whatever the application does. Lengths use `char_length`, which counts code points like the
// contract does. Migrations only move forward, so there is no `down`.

const id = (column: ColumnDefinitionBuilder) => column.primaryKey().defaultTo(sql`gen_random_uuid()`)
const createdAt = (column: ColumnDefinitionBuilder) => column.notNull().defaultTo(sql`now()`)
const updatedAt = createdAt

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', id)
    .addColumn('email', 'text', (column) => column.notNull())
    .addColumn('name', 'text')
    .addColumn('password_hash', 'text')
    .addColumn('signed_up_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', createdAt)
    .addCheckConstraint('users_email_length', sql`char_length(email) between 3 and 254`)
    .addCheckConstraint('users_name_length', sql`name is null or char_length(name) between 1 and 80`)
    // A pending member, added by email, has an identity and nothing else until that email signs up.
    .addCheckConstraint('users_name_iff_signed_up', sql`(signed_up_at is null) = (name is null)`)
    .addCheckConstraint('users_password_needs_sign_up', sql`password_hash is null or signed_up_at is not null`)
    .execute()
  await db.schema
    .createIndex('users_email_lower_key')
    .unique()
    .on('users')
    .expression(sql`lower(email)`)
    .execute()

  await db.schema
    .createTable('sessions')
    .addColumn('id', 'uuid', id)
    .addColumn('user_id', 'uuid', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('token_hash', 'bytea', (column) => column.notNull().unique())
    .addColumn('expires_at', 'timestamptz', (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', createdAt)
    .addCheckConstraint('sessions_expire_after_creation', sql`expires_at > created_at`)
    .execute()
  await db.schema.createIndex('sessions_user_id_idx').on('sessions').column('user_id').execute()
  await db.schema.createIndex('sessions_expires_at_idx').on('sessions').column('expires_at').execute()

  await db.schema
    .createTable('workspaces')
    .addColumn('id', 'uuid', id)
    .addColumn('name', 'text', (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', createdAt)
    .addCheckConstraint('workspaces_name_length', sql`char_length(name) between 1 and 80`)
    .execute()

  await db.schema
    .createTable('memberships')
    .addColumn('workspace_id', 'uuid', (column) => column.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('role', 'text', (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', createdAt)
    .addPrimaryKeyConstraint('memberships_pkey', ['workspace_id', 'user_id'])
    .addCheckConstraint('memberships_role_valid', sql`role in ('owner', 'member')`)
    .execute()
  await db.schema.createIndex('memberships_user_id_idx').on('memberships').column('user_id').execute()

  await db.schema
    .createTable('folders')
    .addColumn('id', 'uuid', id)
    .addColumn('workspace_id', 'uuid', (column) => column.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'text', (column) => column.notNull())
    .addColumn('revision', 'integer', (column) => column.notNull().defaultTo(1))
    .addColumn('created_at', 'timestamptz', createdAt)
    .addColumn('updated_at', 'timestamptz', updatedAt)
    .addUniqueConstraint('folders_workspace_id_id_key', ['workspace_id', 'id'])
    .addCheckConstraint('folders_name_length', sql`char_length(name) between 1 and 80`)
    .addCheckConstraint('folders_revision_positive', sql`revision >= 1`)
    .execute()

  await db.schema
    .createTable('documents')
    .addColumn('id', 'uuid', id)
    .addColumn('workspace_id', 'uuid', (column) => column.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('folder_id', 'uuid')
    .addColumn('title', 'text', (column) => column.notNull())
    .addColumn('excerpt', 'text')
    .addColumn('revision', 'integer', (column) => column.notNull().defaultTo(1))
    // Sharing is private until someone says otherwise.
    .addColumn('general_access', 'text', (column) => column.notNull().defaultTo('none'))
    .addColumn('created_by', 'uuid', (column) => column.notNull().references('users.id'))
    .addColumn('archived_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', createdAt)
    .addColumn('updated_at', 'timestamptz', updatedAt)
    .addUniqueConstraint('documents_workspace_id_id_key', ['workspace_id', 'id'])
    // A document without a folder (`folder_id` null) is not checked; one with a folder must find it in its workspace.
    .addForeignKeyConstraint('documents_folder_fkey', ['workspace_id', 'folder_id'], 'folders', ['workspace_id', 'id'])
    .addCheckConstraint('documents_title_length', sql`char_length(title) between 1 and 200`)
    .addCheckConstraint('documents_excerpt_length', sql`excerpt is null or char_length(excerpt) <= 300`)
    .addCheckConstraint('documents_revision_positive', sql`revision >= 1`)
    .addCheckConstraint(
      'documents_general_access_valid',
      sql`general_access in ('none', 'viewer', 'commenter', 'editor')`,
    )
    .execute()
  await db.schema.createIndex('documents_folder_idx').on('documents').columns(['workspace_id', 'folder_id']).execute()

  await db.schema
    .createTable('document_access')
    .addColumn('workspace_id', 'uuid', (column) => column.notNull())
    .addColumn('document_id', 'uuid', (column) => column.notNull())
    .addColumn('user_id', 'uuid', (column) => column.notNull())
    .addColumn('role', 'text', (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', createdAt)
    .addPrimaryKeyConstraint('document_access_pkey', ['document_id', 'user_id'])
    .addForeignKeyConstraint(
      'document_access_document_fkey',
      ['workspace_id', 'document_id'],
      'documents',
      ['workspace_id', 'id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    // The grant goes to a member of the same workspace, a pending one included; removing the member removes the grant.
    .addForeignKeyConstraint(
      'document_access_member_fkey',
      ['workspace_id', 'user_id'],
      'memberships',
      ['workspace_id', 'user_id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .addCheckConstraint('document_access_role_valid', sql`role in ('viewer', 'commenter', 'editor', 'owner')`)
    .execute()
  await db.schema
    .createIndex('document_access_member_idx')
    .on('document_access')
    .columns(['workspace_id', 'user_id'])
    .execute()

  await db.schema
    .createTable('document_states')
    .addColumn('document_id', 'uuid', (column) => column.primaryKey())
    .addColumn('workspace_id', 'uuid', (column) => column.notNull())
    .addColumn('state', 'bytea', (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', createdAt)
    .addColumn('updated_at', 'timestamptz', updatedAt)
    .addForeignKeyConstraint(
      'document_states_document_fkey',
      ['workspace_id', 'document_id'],
      'documents',
      ['workspace_id', 'id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .execute()

  await db.schema
    .createTable('pins')
    .addColumn('workspace_id', 'uuid', (column) => column.notNull())
    .addColumn('document_id', 'uuid', (column) => column.notNull())
    .addColumn('user_id', 'uuid', (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', createdAt)
    .addPrimaryKeyConstraint('pins_pkey', ['user_id', 'document_id'])
    .addForeignKeyConstraint(
      'pins_document_fkey',
      ['workspace_id', 'document_id'],
      'documents',
      ['workspace_id', 'id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .addForeignKeyConstraint(
      'pins_member_fkey',
      ['workspace_id', 'user_id'],
      'memberships',
      ['workspace_id', 'user_id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .execute()
  await db.schema.createIndex('pins_document_idx').on('pins').columns(['workspace_id', 'document_id']).execute()
}
