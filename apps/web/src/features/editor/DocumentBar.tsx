import type { Schema } from '@draftroom/contract'
import type { Editor } from '@tiptap/core'
import { CommentsControls } from '../comments/CommentsControls.tsx'
import { ReadOnlyNotice } from './ReadOnlyNotice.tsx'
import { Toolbar } from './Toolbar.tsx'
import styles from './DocumentBar.module.css'

export interface DocumentBarProps {
  editor: Editor
  document: Pick<Schema<'Document'>, 'id' | 'role'>
  /** Whether the text takes edits, which is what the formatting toolbar is for. */
  editable: boolean
  onLinkRequest: (currentHref: string | null) => void
}

/**
 * The bar under the band, in sight as well: what can be done to the text (the toolbar for those who may edit it, the notice
 * that says why not for those who may not) and, at its end, what is shown of the comments. A reader and a commenter have no
 * toolbar and the same controls for the comments as an editor.
 */
export function DocumentBar({ editor, document, editable, onLinkRequest }: DocumentBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.tools}>
        {editable && <Toolbar editor={editor} onLinkRequest={onLinkRequest} />}
        {(document.role === 'viewer' || document.role === 'commenter') && <ReadOnlyNotice role={document.role} />}
      </div>
      <CommentsControls documentId={document.id} />
    </div>
  )
}
