import { isApiError } from '../../data/errors.ts'

/**
 * Whether the document is no longer in the trash: someone else deleted it (`not-found`) or restored it before the person
 * acted (`conflict`, which is what deleting a document that is not archived answers).
 */
export const isGone = (error: unknown) => isApiError(error, 'not-found') || isApiError(error, 'conflict')
