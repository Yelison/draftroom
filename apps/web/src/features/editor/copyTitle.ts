import { contractLimits } from '@draftroom/contract'
import type { IntlShape } from 'react-intl'
import { clipToCodePoints } from './clipToCodePoints.ts'

const message = { id: 'editor.duplicate.title' } as const

/**
 * The title of a copy of a document, in the person's language: the server does not translate, so the client names it.
 * The title of the original is cut, not the words around it, so that the copy stays inside the limit of the contract and
 * still says what it is a copy of, with its closing quotation mark.
 */
export function copyTitle(intl: IntlShape, title: string): string {
  const wording = [...intl.formatMessage(message, { title: '' })].length
  return intl.formatMessage(message, { title: clipToCodePoints(title, contractLimits.documentTitle.max - wording) })
}
