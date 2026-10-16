import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { EditorContent } from '@tiptap/react'
import { Button, buttonClassName } from '@yelison/forma-ui'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'
import { presenceLookOf } from '../../collab/presenceColor.ts'
import type { CollabSession, CollabSnapshot } from '../../collab/session.ts'
import { Presence, type PresenceEntry } from '../../components/Presence/Presence.tsx'
import { SyncStatus } from '../../components/SyncStatus/SyncStatus.tsx'
import { useDataSource } from '../../data/useDataSource.ts'
import type { CollaboratingPerson } from './CollaborationExtensions.ts'
import { EditorSkeleton } from './EditorSkeleton.tsx'
import { EditorStatePanel } from './EditorStatePanel.tsx'
import { LinkDialog, type LinkRequest } from './LinkDialog.tsx'
import { SyncAlerts } from './SyncAlerts.tsx'
import { Toolbar } from './Toolbar.tsx'
import { TitleField } from './TitleField.tsx'
import { canEdit } from './roles.ts'
import { meQuery } from './meQuery.ts'
import { useCollabSession } from './useCollabSession.ts'
import { useDocumentEditor } from './useDocumentEditor.ts'
import styles from './Sheet.module.css'

type LinkChange = 'added' | 'updated' | 'removed'

/**
 * The editor of one document: its title, the toolbar for those who may edit, and the text on a Yjs document that is kept
 * in step with the server. What is shown while it opens, and when the connection stops, is the session's: the editor is
 * only there while there is something to show in it.
 */
export function DocumentEditor({ document }: { document: Schema<'Document'> }) {
  const dataSource = useDataSource()
  const session = useCollabSession(document)
  const me = useQuery(meQuery(dataSource))
  const person = useMemo<CollaboratingPerson | null>(
    () =>
      me.data === undefined ? null : { id: me.data.id, name: me.data.name, color: presenceLookOf(me.data.id).color },
    [me.data],
  )

  // The session and the person are known after the first render; until then the screen is the skeleton, which has the same
  // measures.
  return session === null || person === null ? (
    <EditorSkeleton />
  ) : (
    <OpenDocument document={document} session={session} person={person} />
  )
}

/** The states in which the document is not shown: it is on its way, or there is no document to show for this person. */
function OpenDocument({
  document,
  session,
  person,
}: {
  document: Schema<'Document'>
  session: CollabSession
  person: CollaboratingPerson
}) {
  const intl = useIntl()
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const stopped = snapshot.state === 'revoked' || (!snapshot.loaded && snapshot.state === 'error')

  if (snapshot.state === 'revoked') {
    return (
      <EditorStatePanel
        title={intl.formatMessage({ id: 'sync.revoked.title' })}
        description={intl.formatMessage({ id: 'sync.revoked.description' })}
      >
        <Link to="/documents" className={buttonClassName()}>
          {intl.formatMessage({ id: 'sync.revoked.action' })}
        </Link>
      </EditorStatePanel>
    )
  }
  if (stopped && snapshot.cause !== null) {
    return (
      <EditorStatePanel
        title={intl.formatMessage({ id: `sync.problem.${snapshot.cause}.title` })}
        description={intl.formatMessage({ id: `sync.problem.${snapshot.cause}.description` })}
      >
        <Button onClick={session.retry}>{intl.formatMessage({ id: 'sync.problem.retry' })}</Button>
      </EditorStatePanel>
    )
  }
  if (!snapshot.loaded) return <EditorSkeleton />

  // A new document and provider mean a new editor: the one that was bound to the old ones is left with them.
  return (
    <EditorWorkspace
      key={snapshot.generation}
      document={document}
      session={session}
      snapshot={snapshot}
      person={person}
    />
  )
}

function EditorWorkspace({
  document,
  session,
  snapshot,
  person,
}: {
  document: Schema<'Document'>
  session: CollabSession
  snapshot: CollabSnapshot
  person: CollaboratingPerson
}) {
  const intl = useIntl()
  // The role says what the screen offers and the connection what the server allows: the text takes edits only when both do.
  const mayEdit = canEdit(document.role)
  const editable = mayEdit && snapshot.editable
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null)
  const [linkChange, setLinkChange] = useState<LinkChange | null>(null)
  // Counted, so a second refusal is a new message in the live region and is announced again.
  const [refusals, setRefusals] = useState(0)

  const requestLink = useCallback((href: string | null) => {
    setLinkChange(null)
    setLinkRequest({ href })
  }, [])
  const editor = useDocumentEditor({
    ydoc: snapshot.ydoc,
    provider: snapshot.provider,
    person,
    editable,
    hasRoomFor: session.hasRoomFor,
    onTooLarge: () => setRefusals((count) => count + 1),
    contentLabel: intl.formatMessage({ id: 'editor.content.label' }),
    onLinkRequest: requestLink,
  })

  // The button that was pressed to try again is gone when the problem is, and the focus goes to the text, not to the page.
  const retry = () => {
    editor.commands.focus()
    session.retry()
  }

  // What was discarded and loaded again is a text the person did not make: they are put in it once it accepts typing.
  useEffect(() => {
    if (snapshot.generation > 1 && editable) editor.commands.focus('start')
  }, [editor, snapshot.generation, editable])

  const people = useMemo<PresenceEntry[]>(
    () =>
      snapshot.peers.map(({ userId, name }) => ({ userId, name, tone: presenceLookOf(userId).tone, status: 'online' })),
    [snapshot.peers],
  )

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
      <div className={styles.toolbarBand}>
        {editable && <Toolbar editor={editor} onLinkRequest={requestLink} />}
        <div className={styles.status}>
          <Presence people={people} />
          <SyncStatus state={snapshot.state} />
        </div>
      </div>
      <SyncAlerts
        snapshot={snapshot}
        onRetry={retry}
        onDiscard={session.discardAndReload}
        onDismissNotice={session.dismissNotice}
      />
      <div className={styles.sheet}>
        <TitleField document={document} editable={mayEdit} onEnter={() => editor.commands.focus('start')} />
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
      <p role="status" className="forma-visually-hidden">
        {refusals > 0 && <span key={refusals}>{intl.formatMessage({ id: 'editor.paste.tooLarge' })}</span>}
      </p>
    </div>
  )
}
