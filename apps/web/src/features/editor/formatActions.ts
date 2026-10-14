import type { Editor } from '@tiptap/core'
import type { IconName } from '@yelison/forma-ui'
import type { MessageId } from '../../i18n/messages.ts'

export type FormatActionId =
  'bold' | 'italic' | 'code' | 'heading2' | 'heading3' | 'bulletList' | 'orderedList' | 'link'

/** What a toolbar button shows: one of Forma UI's icons, or a glyph of text where the set has none. */
export type Appearance = { icon: IconName } | { glyph: string; glyphStyle: 'bold' | 'italic' | 'code' | 'plain' }

export interface FormatAction {
  id: FormatActionId
  /** The message that names the action, for the button and its tooltip. */
  name: MessageId
  /** In Tiptap's notation. The keys that do the action are Tiptap's own; this is what the tooltip says. */
  shortcut: string
  appearance: Appearance
  isActive(editor: Editor): boolean
}

/** The key that asks for a link. Tiptap has no shortcut for it, so `LinkShortcut` binds this one. */
export const linkShortcut = 'Mod-k'

/**
 * The toolbar, in order. The shortcuts are the ones Tiptap's extensions already bind, and a test presses each of them,
 * so a label that says a key the editor does not answer to fails.
 */
export const formatActions: readonly FormatAction[] = [
  {
    id: 'bold',
    name: 'editor.format.bold',
    shortcut: 'Mod-b',
    appearance: { glyph: 'B', glyphStyle: 'bold' },
    isActive: (editor) => editor.isActive('bold'),
  },
  {
    id: 'italic',
    name: 'editor.format.italic',
    shortcut: 'Mod-i',
    appearance: { glyph: 'I', glyphStyle: 'italic' },
    isActive: (editor) => editor.isActive('italic'),
  },
  {
    id: 'code',
    name: 'editor.format.code',
    shortcut: 'Mod-e',
    appearance: { glyph: '</>', glyphStyle: 'code' },
    isActive: (editor) => editor.isActive('code'),
  },
  {
    id: 'heading2',
    name: 'editor.format.heading2',
    shortcut: 'Mod-Alt-2',
    appearance: { glyph: 'H2', glyphStyle: 'plain' },
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
  },
  {
    id: 'heading3',
    name: 'editor.format.heading3',
    shortcut: 'Mod-Alt-3',
    appearance: { glyph: 'H3', glyphStyle: 'plain' },
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
  },
  {
    id: 'bulletList',
    name: 'editor.format.bulletList',
    shortcut: 'Mod-Shift-8',
    appearance: { icon: 'list' },
    isActive: (editor) => editor.isActive('bulletList'),
  },
  {
    id: 'orderedList',
    name: 'editor.format.orderedList',
    shortcut: 'Mod-Shift-7',
    appearance: { glyph: '1.', glyphStyle: 'plain' },
    isActive: (editor) => editor.isActive('orderedList'),
  },
  {
    id: 'link',
    name: 'editor.format.link',
    shortcut: linkShortcut,
    appearance: { icon: 'link' },
    isActive: (editor) => editor.isActive('link'),
  },
]

/** Does what a button of the toolbar does, to the selection. The link is not here: it asks for an address first. */
export function applyFormat(editor: Editor, id: Exclude<FormatActionId, 'link'>): void {
  // Without `focus()` on purpose: a button pressed with the keyboard keeps the focus, and one pressed with the mouse
  // never took it from the text (`ToolbarButton` stops the mouse down), so nothing has to give it back.
  const chain = editor.chain()
  switch (id) {
    case 'bold':
      return void chain.toggleBold().run()
    case 'italic':
      return void chain.toggleItalic().run()
    case 'code':
      return void chain.toggleCode().run()
    case 'heading2':
      return void chain.toggleHeading({ level: 2 }).run()
    case 'heading3':
      return void chain.toggleHeading({ level: 3 }).run()
    case 'bulletList':
      return void chain.toggleBulletList().run()
    case 'orderedList':
      return void chain.toggleOrderedList().run()
  }
}
