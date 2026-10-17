import type { Schema } from '@draftroom/contract'
import type { Generated } from 'kysely'

// The shape of every table, for Kysely's query builder. Kept beside the migration that creates it: a column that
// changes in a migration changes here in the same commit. Timestamps are `Date` objects, as `pg` returns them.

export type WorkspaceRole = 'owner' | 'member'
export type DocumentRole = 'viewer' | 'commenter' | 'editor' | 'owner'
export type GeneralAccess = 'none' | 'viewer' | 'commenter' | 'editor'
export type ActivityType = Schema<'ActivityType'>
export type VersionKind = Schema<'VersionKind'>
export type Locale = Schema<'Locale'>
export type EditorTextSize = Schema<'EditorTextSize'>

export interface UsersTable {
  id: Generated<string>
  email: string
  /** `null` until the person signs up: a member added by email already has a row. */
  name: string | null
  password_hash: string | null
  signed_up_at: Date | null
  /** `null` until the person chooses a language: the browser's applies. */
  locale: Locale | null
  editor_text_size: Generated<EditorTextSize>
  created_at: Generated<Date>
}

export interface SessionsTable {
  /** Opaque: the collaboration server derives a connection's `sessionId` from it. The cookie holds another secret. */
  id: Generated<string>
  user_id: string
  token_hash: Uint8Array
  /** The end of the session's absolute lifetime, however much it is used. */
  expires_at: Date
  /** The last time it was used, kept to the minute: a session that is not used for a while ends before `expires_at`. */
  last_seen_at: Generated<Date>
  created_at: Generated<Date>
}

export interface WorkspacesTable {
  id: Generated<string>
  name: string
  created_at: Generated<Date>
}

export interface MembershipsTable {
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  created_at: Generated<Date>
}

export interface FoldersTable {
  id: Generated<string>
  workspace_id: string
  name: string
  revision: Generated<number>
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface DocumentsTable {
  id: Generated<string>
  workspace_id: string
  folder_id: string | null
  title: string
  /** The start of the first paragraph; written together with the content by the collaboration server. */
  excerpt: string | null
  revision: Generated<number>
  general_access: Generated<GeneralAccess>
  created_by: string
  archived_at: Date | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface DocumentAccessTable {
  workspace_id: string
  document_id: string
  user_id: string
  role: DocumentRole
  created_at: Generated<Date>
}

export interface DocumentStatesTable {
  document_id: string
  workspace_id: string
  /** The Yjs state of the document, the source of truth for its content. Never rebuilt from JSON. */
  state: Uint8Array
  created_at: Generated<Date>
  updated_at: Generated<Date>
  /** The `updated_at` the automatic versions last looked at, or `null` when they never did (protocol §11.2). */
  versions_checked_at: Date | null
}

export interface PinsTable {
  workspace_id: string
  document_id: string
  user_id: string
  created_at: Generated<Date>
}

export interface ActivityEventsTable {
  id: Generated<string>
  workspace_id: string
  document_id: string
  type: ActivityType
  /** `null` when the server acted. */
  actor_id: string | null
  /** The person an access change is about. */
  target_user_id: string | null
  created_at: Generated<Date>
}

export interface ThreadsTable {
  id: Generated<string>
  workspace_id: string
  document_id: string
  /** The two ends of the range, as the client encoded them. The server never decodes them (protocol §10). */
  anchor_start: string
  anchor_end: string
  /** The text the range covered when the thread was started, kept so a thread whose text is gone still says what it was about. */
  quote: string
  created_by: string
  created_at: Generated<Date>
  /** Set together with `resolved_by`; a thread is resolved when they are. */
  resolved_at: Date | null
  resolved_by: string | null
}

export interface CommentsTable {
  id: Generated<string>
  workspace_id: string
  thread_id: string
  author_id: string
  body: string
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface DocumentVersionsTable {
  id: Generated<string>
  workspace_id: string
  document_id: string
  /** A full Yjs update of the document at the moment of the version. */
  state: Uint8Array
  kind: VersionKind
  label: string | null
  /** `null` exactly when the server made the version on its own: an automatic one. */
  created_by: string | null
  /** The request of the restore a `pre-restore` or `restore` version belongs to, and null for any other. */
  restore_id: string | null
  created_at: Generated<Date>
}

export interface Database {
  users: UsersTable
  sessions: SessionsTable
  workspaces: WorkspacesTable
  memberships: MembershipsTable
  folders: FoldersTable
  documents: DocumentsTable
  document_access: DocumentAccessTable
  document_states: DocumentStatesTable
  pins: PinsTable
  activity_events: ActivityEventsTable
  threads: ThreadsTable
  comments: CommentsTable
  document_versions: DocumentVersionsTable
}
