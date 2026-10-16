import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { EditorContent } from '@tiptap/react'
import { Button, buttonClassName } from '@yelison/forma-ui'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
import { OfflineNotice } from './OfflineNotice.tsx'
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
export function DocumentEditor({
  document,
  focusHeadline,
}: {
  document: Schema<'Document'>
  /** Where the focus goes when what had it is gone and the text cannot take it: the headline of the screen. */
  focusHeadline: () => void
}) {
  const dataSource = useDataSource()
  const me = useQuery(meQuery(dataSource))
  // The id, not the answer: a new answer for the same person must not end the connection and make it again.
  const session = useCollabSession(document, me.data?.id)
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
    <OpenDocument document={document} session={session} person={person} focusHeadline={focusHeadline} />
  )
}

/** The states in which the document is not shown: it is on its way, or there is no document to show for this person. */
function OpenDocument({
  document,
  session,
  person,
  focusHeadline,
}: {
  document: Schema<'Document'>
  session: CollabSession
  person: CollaboratingPerson
  focusHeadline: () => void
}) {
  const intl = useIntl()
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)

  // Said here, above the editor that is made again when changes are discarded, and in a region that was in the page before
  // there was anything to say: an alert that arrives with its text may go unheard, and the notice of discarded changes
  // arrives together with the new editor.
  const problem =
    snapshot.cause !== null
      ? intl.formatMessage({ id: `sync.problem.${snapshot.cause}.title` })
      : snapshot.notice !== null
        ? intl.formatMessage({ id: 'sync.notice.offlineChangesDiscarded.title' })
        : ''

  return (
    <>
      <Shown document={document} session={session} snapshot={snapshot} person={person} focusHeadline={focusHeadline} />
      <p role="status" className="forma-visually-hidden">
        {problem}
      </p>
    </>
  )
}

/** The document, or the reason there is none: loading, access removed, or a connection that could not be opened. */
function Shown({
  document,
  session,
  snapshot,
  person,
  focusHeadline,
}: {
  document: Schema<'Document'>
  session: CollabSession
  snapshot: CollabSnapshot
  person: CollaboratingPerson
  focusHeadline: () => void
}) {
  const intl = useIntl()
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
        <Button
          onClick={() => {
            // The panel becomes the skeleton, and the button goes with it: the focus goes to the headline of the screen.
            focusHeadline()
            session.retry()
          }}
        >
          {intl.formatMessage({ id: 'sync.problem.retry' })}
        </Button>
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
      focusHeadline={focusHeadline}
    />
  )
}

function EditorWorkspace({
  document,
  session,
  snapshot,
  person,
  focusHeadline,
}: {
  document: Schema<'Document'>
  session: CollabSession
  snapshot: CollabSnapshot
  person: CollaboratingPerson
  focusHeadline: () => void
}) {
  const intl = useIntl()
  // The role says what the screen offers and the connection what the server allows: the text takes edits only when both do.
  const mayEdit = canEdit(document.role)
  const editable = mayEdit && snapshot.editable
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null)
  const [linkChange, setLinkChange] = useState<LinkChange | null>(null)
  // Counted, so a second refusal is a new message in the live region and is announced again.
  const [refusals, setRefusals] = useState(0)

  // A dialog that is open when the text stops taking edits is closed for good, not hidden: what it would apply is not the person's
  // to make, and a dialog that was only hidden would open again, empty, when the text takes edits again. The button that opened
  // it goes with the toolbar, so the focus goes to the headline. Adjusted while rendering, from what the last render saw, so that
  // no effect has to set state.
  const [sawEditable, setSawEditable] = useState(editable)
  const [droppedDialog, setDroppedDialog] = useState(false)
  if (sawEditable !== editable) {
    setSawEditable(editable)
    setDroppedDialog(!editable && linkRequest !== null)
    if (!editable) setLinkRequest(null)
  }
  useEffect(() => {
    if (droppedDialog) focusHeadline()
  }, [droppedDialog, focusHeadline])

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

  // The button that was pressed is gone when what it answered is, and the focus must not fall to the page. It goes to the text
  // when the text takes it, and to the headline of the screen until it does (a text that is not editable takes no focus, and
  // after a stopped error it only is once the connection is back). A text that was made again after changes were discarded
  // is one the person did not make, and they are put in it as soon as it accepts typing.
  const textWantsFocus = useRef(snapshot.generation > 1)
  useEffect(() => {
    if (textWantsFocus.current && editable) {
      textWantsFocus.current = false
      editor.commands.focus()
    }
  })

  function handBackFocus() {
    if (editable) {
      editor.commands.focus()
      return
    }
    focusHeadline()
    textWantsFocus.current = true
  }

  const retry = () => {
    handBackFocus()
    session.retry()
  }
  const discard = () => {
    focusHeadline()
    session.discardAndReload()
  }
  const dismissNotice = () => {
    focusHeadline()
    session.dismissNotice()
  }

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
    if (!editable) return
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
    if (!editable) return
    editor.chain().extendMarkRange('link').unsetLink().run()
    finishLink('removed')
  }

  return (
    <div className={styles.column}>
      <div className={styles.toolbarBand}>
        {editable && <Toolbar editor={editor} onLinkRequest={requestLink} />}
        <div className={styles.status}>
          <Presence people={people} />
          <SyncStatus state={snapshot.state} keepsCopy={snapshot.keepsCopy} />
        </div>
      </div>
      <SyncAlerts snapshot={snapshot} onRetry={retry} onDiscard={discard} onDismissNotice={dismissNotice} />
      <div className={styles.sheet}>
        <OfflineNotice snapshot={snapshot} />
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
