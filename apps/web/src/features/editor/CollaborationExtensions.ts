import { fragmentName } from '@draftroom/editor-schema'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { Collaboration } from '@tiptap/extension-collaboration'
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret'
import type * as Y from 'yjs'
import { isPresenceColor } from '../../collab/awareness.ts'
import styles from './Prose.module.css'

/** Who this person is to the others: the id is what the server checks, and it replaces the name with its own. */
export interface CollaboratingPerson {
  id: string
  name: string
  color: string
}

/** The caret of someone else: a bar in their colour with their name over it. The name is text, never markup. */
function renderCaret(user: Record<string, unknown>): HTMLElement {
  const caret = document.createElement('span')
  caret.className = styles.caret ?? ''
  if (isPresenceColor(user['color'])) caret.style.setProperty('--caret-color', user['color'])
  const label = document.createElement('span')
  label.className = styles.caretLabel ?? ''
  label.textContent = typeof user['name'] === 'string' ? user['name'] : ''
  caret.append(label)
  return caret
}

/**
 * The shared content and the carets of the others, over a Yjs document and the provider that carries it. The name on a
 * caret is whatever the server relays for that person (protocol section 5.3), never what a client wrote.
 */
export function collaborationExtensions({
  ydoc,
  provider,
  person,
}: {
  ydoc: Y.Doc
  provider: HocuspocusProvider
  person: CollaboratingPerson
}) {
  return [
    Collaboration.configure({ document: ydoc, field: fragmentName }),
    CollaborationCaret.configure({
      provider,
      user: person,
      render: renderCaret,
      selectionRender: (user) => ({
        nodeName: 'span',
        class: styles.selection ?? '',
        style: `--caret-color: ${isPresenceColor(user['color']) ? user['color'] : 'transparent'}`,
      }),
    }),
  ]
}
