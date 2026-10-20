import { editorExtensions, fragmentName } from '@draftroom/editor-schema'
import { Collaboration } from '@tiptap/extension-collaboration'
import { EditorContent, useEditor } from '@tiptap/react'
import { useMemo } from 'react'
import * as Y from 'yjs'
import prose from '../editor/Prose.module.css'
import styles from './VersionReader.module.css'

/**
 * The text of one version, read-only. It is a Yjs document of its own, made from the update and given to no provider:
 * nothing here can reach the live document, and nothing typed here could be sent anywhere. The editor is the one of the
 * app, so the text looks as it did.
 */
export function PreviewDocument({ document, label }: { document: Y.Doc; label: string }) {
  const extensions = useMemo(
    () => [...editorExtensions(), Collaboration.configure({ document, field: fragmentName })],
    [document],
  )
  const editor = useEditor(
    {
      extensions,
      editable: false,
      editorProps: { attributes: { class: prose.prose ?? '' } },
    },
    [extensions],
  )

  // The text is read, not edited, so it takes no focus of its own; the region around it does, so a long version scrolls
  // with the keyboard.
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className={styles.scroller} tabIndex={0} role="region" aria-label={label}>
      <EditorContent editor={editor} />
    </div>
  )
}
