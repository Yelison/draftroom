import type { Schema } from '@draftroom/contract'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useQuery } from '@tanstack/react-query'
import type { Editor } from '@tiptap/core'
import { Tabs } from '@yelison/forma-ui'
import { useEffect, useState } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { DocumentActivity } from '../history/DocumentActivity.tsx'
import { boundDocumentOf, createAnchor, quoteOf } from './anchors.ts'
import type { CommentRequests } from './commentRequests.ts'
import { CommentsTab, type Reveal } from './CommentsTab.tsx'
import { highlightedThreads, showHighlights } from './highlightPlugin.ts'
import type { Draft } from './NewThreadComposer.tsx'
import { threadsQuery } from './queries.ts'
import { canComment } from './roles.ts'
import type { Announcement } from './useCardActions.ts'
import { useFirstHandshake } from './useFirstHandshake.ts'
import { usePlacements } from './usePlacements.ts'
import styles from './CollaborationPanel.module.css'

type Tab = 'comments' | 'activity'

export interface CollaborationPanelProps {
  editor: Editor
  provider: HocuspocusProvider
  document: Pick<Schema<'Document'>, 'id' | 'workspaceId' | 'role'>
  personId: string
  requests: CommentRequests
}

/**
 * The panel beside the text, with the document's comments and its activity. It also owns what ties the comments to the
 * text: the highlights of the open threads, the comment being written, the thread the person is on, and what the text
 * asks of it (to start a comment, to show a thread).
 */
export function CollaborationPanel({ editor, provider, document, personId, requests }: CollaborationPanelProps) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const threads = useQuery(threadsQuery(dataSource, document.id))
  const handshaken = useFirstHandshake(provider)
  const placements = usePlacements(editor)
  const [tab, setTab] = useState<Tab>('comments')
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [announcement, setAnnouncement] = useState<{ id: Announcement; count: number } | null>(null)

  // The highlights follow the open threads: a resolved thread has none, and one the server no longer has goes with it.
  useEffect(() => {
    showHighlights(editor, highlightedThreads(threads.data ?? []), { handshaken, activeThreadId })
  }, [editor, threads.data, handshaken, activeThreadId])

  function startDraft() {
    const { from, to, empty } = editor.state.selection
    const bound = boundDocumentOf(editor.state)
    if (empty || bound === null || !canComment(document.role)) return
    const quote = quoteOf(editor.state.doc, from, to)
    if (quote.trim() === '') return
    setDraft({ anchor: createAnchor(bound, from, to), quote, body: '' })
    setTab('comments')
  }

  useEffect(
    () =>
      requests.subscribe((request) => {
        if (request.type === 'comment') return startDraft()
        setTab('comments')
        setActiveThreadId(request.threadId)
        setReveal((previous) => ({
          threadId: request.threadId,
          focus: request.focus,
          count: (previous?.count ?? 0) + 1,
        }))
      }),
    // `startDraft` reads the editor and the role, both of which this effect already depends on.
    // oxlint-disable-next-line react/exhaustive-deps
    [requests, editor, document.role],
  )

  return (
    <aside className={styles.panel} aria-label={intl.formatMessage({ id: 'comments.panel.label' })}>
      <Tabs
        label={intl.formatMessage({ id: 'comments.panel.tabs' })}
        value={tab}
        onChange={(id) => setTab(id === 'activity' ? 'activity' : 'comments')}
        items={[
          {
            id: 'comments',
            label: intl.formatMessage({ id: 'comments.tab.comments' }),
            content: (
              <CommentsTab
                document={document}
                editor={editor}
                personId={personId}
                placements={placements}
                activeThreadId={activeThreadId}
                onActivate={setActiveThreadId}
                draft={draft}
                onDraftChange={(body) => setDraft((current) => (current === null ? null : { ...current, body }))}
                onDraftEnd={() => setDraft(null)}
                onStartDraft={startDraft}
                reveal={reveal}
                onAnnounce={(id) => setAnnouncement((previous) => ({ id, count: (previous?.count ?? 0) + 1 }))}
              />
            ),
          },
          {
            id: 'activity',
            label: intl.formatMessage({ id: 'comments.tab.activity' }),
            content: (
              <div className={styles.activity}>
                <h2 className="forma-visually-hidden">{intl.formatMessage({ id: 'comments.tab.activity' })}</h2>
                <DocumentActivity documentId={document.id} />
              </div>
            ),
          },
        ]}
      />
      {/* Heard, not seen. In the page before anything is said in it: a region that arrives with its text is not announced. */}
      <p role="status" className="forma-visually-hidden">
        {announcement !== null && (
          <span key={announcement.count}>{intl.formatMessage({ id: `comments.announce.${announcement.id}` })}</span>
        )}
      </p>
    </aside>
  )
}
