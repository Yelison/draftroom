import type { Schema } from '@draftroom/contract'

type DocumentRole = Schema<'DocumentRole'>
type GeneralAccess = Schema<'GeneralAccess'>

/** The roles a person can be given, from the least to the most. */
export const documentRoles: readonly DocumentRole[] = ['viewer', 'commenter', 'editor', 'owner']

/** What a document can be open to for everyone in the workspace, from the least to the most. */
export const generalAccesses: readonly GeneralAccess[] = ['none', 'viewer', 'commenter', 'editor']

export const isDocumentRole = (value: string): value is DocumentRole => documentRoles.some((role) => role === value)

export const isGeneralAccess = (value: string): value is GeneralAccess =>
  generalAccesses.some((access) => access === value)
