import type { Transaction } from 'kysely'
import type { Database, DocumentRole, GeneralAccess } from '../tables.ts'

// The writes to who can open a document. They run in one transaction with their event of the history, and they start
// by taking the locks below, in this order and no other: the memberships of the people involved (by id), then the
// document, then the grants. A change that took them in another order could wait for one that holds what it needs.

export interface AccessChangeScope {
  readonly workspaceId: string
  readonly documentId: string
  /** The person who asks and the person it is about, which may be the same one. */
  readonly userIds: readonly string[]
}

/**
 * Locks what the person who asks is allowed by, and what the change is about, until the transaction ends. The caller
 * checks the person's role again once this has returned (ADR 0012): a change that revokes it at the same moment either
 * committed before the lock was taken, and is seen, or waits for this one.
 *
 * The memberships are shared locks, so that two people changing access at once do not wait for each other there, but
 * anyone who removes or demotes a member does. The document is locked so that every change to who can open it, the last
 * owner rule included, happens one at a time.
 */
export async function lockAccessChange(trx: Transaction<Database>, scope: AccessChangeScope): Promise<void> {
  await trx
    .selectFrom('memberships')
    .select('user_id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('user_id', 'in', [...new Set(scope.userIds)])
    .orderBy('user_id')
    .forShare()
    .execute()
  await trx.selectFrom('documents').select('id').where('id', '=', scope.documentId).forNoKeyUpdate().execute()
}

export interface NewGrant {
  readonly workspaceId: string
  readonly documentId: string
  readonly userId: string
  readonly role: DocumentRole
}

/** Gives the person the role, or changes the one they have: the grant keeps its `created_at` when only the role changes. */
export async function upsertGrant(trx: Transaction<Database>, grant: NewGrant): Promise<void> {
  await trx
    .insertInto('document_access')
    .values({
      workspace_id: grant.workspaceId,
      document_id: grant.documentId,
      user_id: grant.userId,
      role: grant.role,
    })
    .onConflict((conflict) => conflict.columns(['document_id', 'user_id']).doUpdateSet({ role: grant.role }))
    .execute()
}

/** Removes the person's grant, and says whether they had one. */
export async function deleteGrant(trx: Transaction<Database>, documentId: string, userId: string): Promise<boolean> {
  const deleted = await trx
    .deleteFrom('document_access')
    .where('document_id', '=', documentId)
    .where('user_id', '=', userId)
    .returning('user_id')
    .executeTakeFirst()
  return deleted !== undefined
}

/** Changes what every member without a grant can do. It is not a change to the document's metadata: no revision. */
export async function updateGeneralAccess(
  trx: Transaction<Database>,
  documentId: string,
  generalAccess: GeneralAccess,
): Promise<void> {
  await trx.updateTable('documents').set({ general_access: generalAccess }).where('id', '=', documentId).execute()
}
