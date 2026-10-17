import type { JSONContent } from '@tiptap/core'

// The excerpt a document shows in lists is the start of its first paragraph. The rule is one, whether the content was typed
// (the collaboration server writes it after each store) or came with the document (a template).

/** The longest excerpt, in code points: `maxLength` of `Document.excerpt` in the contract, and the check of the column. */
export const excerptLimit = 300

/**
 * The text of the first paragraph that has any, in document order (one inside a list item counts), or `null` when the
 * document has none. A line break reads as a space and runs of white space as one, so the excerpt is a single line. It is
 * cut in code points, never inside a character such as an emoji.
 */
export function excerptOf(content: JSONContent): string | null {
  const text = firstParagraphText(content)
  if (text === null) return null
  return Array.from(text).slice(0, excerptLimit).join('').trimEnd()
}

function firstParagraphText(node: JSONContent): string | null {
  if (node.type === 'paragraph') {
    const text = inlineText(node).replace(/\s+/g, ' ').trim()
    return text === '' ? null : text
  }
  for (const child of node.content ?? []) {
    const found = firstParagraphText(child)
    if (found !== null) return found
  }
  return null
}

function inlineText(node: JSONContent): string {
  if (node.type === 'hardBreak') return ' '
  return (node.text ?? '') + (node.content ?? []).map(inlineText).join('')
}
