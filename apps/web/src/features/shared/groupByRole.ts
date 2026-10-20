import type { Schema } from '@draftroom/contract'

/** The roles a document can be shared with: the owner is who made it, and nobody shares a document with its owner. */
export type SharedRole = Exclude<Schema<'DocumentRole'>, 'owner'>

/** The order of the page: from what the person can do most to what they can do least. */
export const sharedRoles: readonly SharedRole[] = ['editor', 'commenter', 'viewer']

/** What the grouping needs of a document: the role the person has in it. */
interface WithRole {
  role: Schema<'DocumentRole'>
}

export interface SharedGroup<T extends WithRole> {
  role: SharedRole
  documents: readonly T[]
}

/**
 * Splits the shared list by the role the person has in each document, in the order of `sharedRoles`. A role with no
 * documents has no group, and the documents of each keep the order the list had.
 */
export function groupByRole<T extends WithRole>(documents: readonly T[]): SharedGroup<T>[] {
  return sharedRoles.flatMap((role) => {
    const ofRole = documents.filter((document) => document.role === role)
    return ofRole.length === 0 ? [] : [{ role, documents: ofRole }]
  })
}
