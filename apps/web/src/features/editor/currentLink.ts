import type { Editor } from '@tiptap/core'

/** The address of the link the cursor or the selection is in, or `null` when it is in none. */
export function currentLinkHref(editor: Editor): string | null {
  if (!editor.isActive('link')) return null
  const { href } = editor.getAttributes('link')
  return typeof href === 'string' ? href : null
}
