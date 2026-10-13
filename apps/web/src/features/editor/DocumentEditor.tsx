import type { Schema } from '@draftroom/contract'
import { EditorContent } from '@tiptap/react'
import { useCallback, useState } from 'react'
import { useIntl } from 'react-intl'
import type * as Y from 'yjs'
import { LinkDialog, type LinkRequest } from './LinkDialog.tsx'
import { Toolbar } from './Toolbar.tsx'
import { TitleField } from './TitleField.tsx'
import { canEdit } from './roles.ts'
import { useDocumentEditor } from './useDocumentEditor.ts'
import { useLocalYDoc } from './useLocalYDoc.ts'
import { EditorSkeleton } from './EditorSkeleton.tsx'
import styles from './Sheet.module.css'

type LinkChange = 'added' | 'updated' | 'removed'

/**
 * The editor of one document: its title, the toolbar for those who may edit, and the text on a Yjs document that is
 * made when the document is opened and destroyed when it is left. Nothing is sent anywhere yet.
 */
export function DocumentEditor({ document }: { document: Schema<'Document'> }) {
  const ydoc = useLocalYDoc()
  // The Yjs document is made after the first render; until then the screen is the skeleton, which has the same measures.
  return ydoc === null ? <EditorSkeleton /> : <EditorWorkspace document={document} ydoc={ydoc} />
}

function EditorWorkspace({ document, ydoc }: { document: Schema<'Document'>; ydoc: Y.Doc }) {
  const intl = useIntl()
  const editable = canEdit(document.role)
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null)
  const [linkChange, setLinkChange] = useState<LinkChange | null>(null)

  const requestLink = useCallback((href: string | null) => {
    setLinkChange(null)
    setLinkRequest({ href })
  }, [])
  const editor = useDocumentEditor({
    ydoc,
    editable,
    contentLabel: intl.formatMessage({ id: 'editor.content.label' }),
    onLinkRequest: requestLink,
  })

  function finishLink(change: LinkChange) {
    setLinkChange(change)
    setLinkRequest(null)
  }

  function applyLink(href: string) {
    const chain = editor.chain()
    const insideLink = editor.isActive('link')
    if (insideLink) chain.extendMarkRange('link')
    // With nothing selected and no link to change there is no text to link: the address is the text.
    if (editor.state.selection.empty && !insideLink) {
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
    } else {
      chain.setLink({ href })
    }
    chain.run()
    finishLink(insideLink ? 'updated' : 'added')
  }

  function removeLink() {
    editor.chain().extendMarkRange('link').unsetLink().run()
    finishLink('removed')
  }

  return (
    <div className={styles.column}>
      <div className={styles.toolbarBand}>{editable && <Toolbar editor={editor} onLinkRequest={requestLink} />}</div>
      <div className={styles.sheet}>
        <TitleField document={document} editable={editable} onEnter={() => editor.commands.focus('start')} />
        <EditorContent editor={editor} />
      </div>
      <LinkDialog
        request={linkRequest}
        onSubmit={applyLink}
        onRemove={removeLink}
        onClose={() => setLinkRequest(null)}
      />
      {/* Heard, not seen. The region is in the page before anything is said in it: one that appears with its text is not announced. */}
      <p role="status" className="forma-visually-hidden">
        {linkChange !== null && intl.formatMessage({ id: 'editor.link.announcement' }, { change: linkChange })}
      </p>
    </div>
  )
}
