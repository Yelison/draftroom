import type { DocumentRole } from '@draftroom/contract'

/**
 * Whether the role may change the content and the title. This only decides what the screen offers: the server decides
 * what is allowed, and refuses what a role may not do however the screen was drawn.
 */
export const canEdit = (role: DocumentRole): boolean => role === 'editor' || role === 'owner'
