import type { Schema } from '@draftroom/contract'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useQuery } from '@tanstack/react-query'
import type { Editor } from '@tiptap/core'
import { Button } from '@yelison/forma-ui'
import { useCallback, useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { useNarrowWindow } from '../../../app/narrowWindow.ts'
import type { CommentCardState } from '../../../components/CommentCard/CommentCard.tsx'
import { succeeded, type Outcome } from '../../../components/CommentCard/outcome.ts'
import { useDataSource } from '../../../data/useDataSource.ts'
import { StateMessage } from '../../documents/StateMessage.tsx'
import type { CommentRequest, CommentRequests } from '../commentRequests.ts'
import { commentsMarginId, useCommentsView } from '../commentsView.ts'
import { highlightedThreads, resolvedThreads, showHighlights, type Placement } from '../highlightPlugin.ts'
import { NewThreadComposer, type Draft } from '../NewThreadComposer.tsx'
import { threadsQuery } from '../queries.ts'
import { canComment } from '../roles.ts'
import { SelectionAction } from '../SelectionAction.tsx'
import { failedOutcome, useCardActions, type Announcement } from '../useCardActions.ts'
import { useFirstHandshake } from '../useFirstHandshake.ts'
import { useFocusPlan } from '../useFocusPlan.ts'
import { usePlacements } from '../usePlacements.ts'
import { useSelectionToComment } from '../useSelectionToComment.ts'
import { useThreadActions } from '../useThreadActions.ts'
import { arrangeThreads } from './arrangeThreads.ts'
import { MarginThread } from './MarginThread.tsx'
import { MarginList, labelId } from './MarginList.tsx'
import { useCommentDraft } from './useCommentDraft.ts'
import { useMarginLayout } from './useMarginLayout.ts'
import { useRevealThread } from './useRevealThread.ts'
import { useSelectionTop } from './useSelectionTop.ts'
import styles from './CommentsMargin.module.css'

/** The comment being written has no thread yet, and takes the place its text has. */
const draftId = 'new-comment'

export interface CommentsMarginProps {
  editor: Editor
  provider: HocuspocusProvider
  document: Pick<Schema<'Document'>, 'id' | 'workspaceId' | 'role'>
  personId: string
  requests: CommentRequests
}

const stateOf = (thread: Schema<'Thread'>, placement: Placement | undefined): CommentCardState =>
  thread.status === 'resolved' ? 'resolved' : placement?.status === 'orphaned' ? 'orphaned' : 'open'

/**
 * The comments of the document, in the margin of the sheet: each thread level with its text, the one the person is on as
 * the whole card and the others compact. It also owns what ties the comments to the text: the highlights of the threads, the
 * comment being written, the thread the person is on and what the text asks of it (to start a comment, to show a thread).
 * Hidden, it is not taken out: the highlights follow the threads and a comment being written is not lost, and a request from
 * the text shows it.
 *
 * The threads are all fetched once and the filter only chooses among them, so changing it never waits. Under the width of
 * a desktop there is no beside: the margin follows the text, in the order of the text, and nothing is measured.
 */
export function CommentsMargin({ editor, provider, document, personId, requests }: CommentsMarginProps) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const view = useCommentsView()
  const { filter, setFilter, marginShown, showMargin, setTab, setActiveThread } = view
  const activeThreadId = view.activeThreadId(document.id)
  const query = useQuery(threadsQuery(dataSource, document.id))
  const handshaken = useFirstHandshake(provider)
  const placements = usePlacements(editor)
  const beside = !useNarrowWindow()
  const mutations = useThreadActions(document)
  const selection = useSelectionToComment(editor)
  const mayComment = canComment(document.role)
  const [announcement, setAnnouncement] = useState<{ id: Announcement; count: number } | null>(null)
  const margin = useRef<HTMLElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const announce = (id: Announcement) => setAnnouncement((previous) => ({ id, count: (previous?.count ?? 0) + 1 }))

  const threads = useMemo(() => query.data ?? [], [query.data])
  const arranged = useMemo(() => arrangeThreads({ threads, placements, filter }), [threads, placements, filter])

  // The highlights follow the open threads: a resolved thread has none, and one the server no longer has goes with it.
  useEffect(() => {
    showHighlights(editor, highlightedThreads(threads), {
      handshaken,
      activeThreadId,
      resolved: resolvedThreads(threads),
    })
  }, [editor, threads, handshaken, activeThreadId])

  const comment = useCommentDraft({
    editor,
    mayComment,
    onQuoteChanged: () => announce('quoteChanged'),
    onStarted: () => setTab('comments'),
  })
  const { draft, from: draftFrom } = comment
  const placed = useMemo(() => {
    const onText = arranged.placed.map(({ thread, from }) => ({ id: thread.id, from }))
    if (draftFrom === null) return onText
    const after = onText.findIndex(({ from }) => from > draftFrom)
    return onText.toSpliced(after === -1 ? onText.length : after, 0, { id: draftId, from: draftFrom })
  }, [arranged.placed, draftFrom])
  const trailing = useMemo(
    () => [
      ...(draft !== null && draftFrom === null ? [draftId] : []),
      ...arranged.orphaned.map(({ id }) => id),
      ...arranged.waiting.map(({ id }) => id),
    ],
    [draft, draftFrom, arranged.orphaned, arranged.waiting],
  )
  const hasOrphans = arranged.orphaned.length > 0
  const { plan, registerCard, registerLabel } = useMarginLayout({
    editor,
    margin,
    placed,
    trailing,
    labelled: hasOrphans,
    beside: beside && marginShown,
    // The comment being written is as tall as the active thread and has the same claim to be level with its text.
    activeId: draft !== null && draftFrom !== null ? draftId : activeThreadId,
  })

  // Empty on the render that mounts the region and the message on the next: the pattern of the other live regions that come with
  // a screen (a deferred value that starts as '').
  const loading = useDeferredValue(query.isPending ? intl.formatMessage({ id: 'comments.margin.loading' }) : '', '')
  const shownCount = arranged.placed.length + arranged.orphaned.length + arranged.waiting.length
  // What changes what is on the page: a thread comes or goes, changes its state, or loses a comment.
  const signature = [...arranged.placed.map(({ thread }) => thread), ...arranged.orphaned, ...arranged.waiting]
    .map((thread) => `${thread.id}:${thread.status}:${thread.comments.length}`)
    .join()
  const focusPlan = useFocusPlan(list, heading, signature)

  const actionsFor = useCardActions(mutations, {
    onDone: announce,
    onBefore: (thread) => focusPlan.keepFocusAround(thread.id),
  })

  const reveal = useRevealThread({ list, threads, filter, onFilter: setFilter, placements, handshaken })
  const activate = useCallback(
    (threadId: string, { focus }: { focus: boolean }) => {
      setActiveThread(document.id, threadId)
      if (focus) reveal(threadId, { focus })
    },
    [document.id, setActiveThread, reveal],
  )

  // What the text asks of the margin. It reads the draft and the editor as they are when it is asked, which the effect that
  // listens must not depend on: it would listen again, and miss a request in between, with every keystroke.
  const answer = useEffectEvent((request: CommentRequest) => {
    // Shown in the same render that asks for the focus of the form or the thread, so what is to take it is on screen.
    showMargin()
    if (request.type === 'comment') return comment.start()
    setTab('comments')
    activate(request.threadId, { focus: request.focus })
  })
  useEffect(() => requests.subscribe(answer), [requests])

  function showInText(threadId: string) {
    const placement = placements.get(threadId)
    if (placement?.status === 'placed') {
      editor.chain().focus().setTextSelection({ from: placement.from, to: placement.to }).scrollIntoView().run()
    } else {
      editor.commands.focus()
    }
  }

  async function createThread({ anchor, quote, body }: Draft): Promise<Outcome> {
    try {
      const created = await mutations.createThread.mutateAsync({ anchor, quote, body })
      setFilter('open')
      // The card is shown and given the focus once the text has placed the thread, as it is for one the text asks for.
      activate(created.id, { focus: true })
      comment.end()
      announce('created')
      return succeeded
    } catch (error) {
      return failedOutcome(intl, error)
    }
  }

  const selectionTop = useSelectionTop(editor, margin)

  const cardOf = (thread: Schema<'Thread'>) => (
    <MarginThread
      thread={thread}
      state={stateOf(thread, placements.get(thread.id))}
      active={thread.id === activeThreadId}
      role={document.role}
      personId={personId}
      actions={actionsFor(thread)}
      onActivate={() => activate(thread.id, { focus: true })}
      onShowInText={() => showInText(thread.id)}
    />
  )

  const composer = draft !== null && (
    <NewThreadComposer
      draft={draft}
      focusRequest={comment.focusRequest}
      onChange={comment.write}
      onSubmit={createThread}
      onCancel={() => {
        comment.end()
        editor.commands.focus()
      }}
    />
  )

  const threadById = new Map(
    [...arranged.placed.map(({ thread }) => thread), ...arranged.orphaned, ...arranged.waiting].map((thread) => [
      thread.id,
      thread,
    ]),
  )
  const renderCard = (id: string) => {
    if (id === draftId) return composer
    const thread = threadById.get(id)
    return thread === undefined ? null : cardOf(thread)
  }

  return (
    <aside
      id={commentsMarginId}
      ref={margin}
      hidden={!marginShown}
      className={styles.margin}
      aria-label={intl.formatMessage({ id: 'comments.margin.label' })}
      style={beside && plan !== null ? { minBlockSize: plan.extent } : undefined}
    >
      <h2 ref={heading} tabIndex={-1} className="forma-visually-hidden">
        {intl.formatMessage({ id: 'comments.tab.comments' })}
      </h2>

      {mayComment && selection !== null && (
        <div
          className={styles.selection}
          style={beside && selectionTop !== null ? { insetBlockStart: selectionTop } : undefined}
        >
          <SelectionAction onStart={comment.start} composing={draft !== null} />
        </div>
      )}

      {query.isError && (
        <StateMessage
          role="alert"
          title={intl.formatMessage({ id: 'comments.error.title' })}
          description={intl.formatMessage({ id: 'comments.error.description' })}
        >
          <Button loading={query.isFetching} onClick={() => void query.refetch()}>
            {intl.formatMessage({ id: 'comments.error.retry' })}
          </Button>
        </StateMessage>
      )}
      {/* In the page, empty, before it says anything: a live region that arrives with its text is not announced. */}
      <p role="status" className={loading === '' ? 'forma-visually-hidden' : styles.caption}>
        {loading}
      </p>
      {!query.isError && threads.length > 0 && shownCount === 0 && draft === null && (
        <p className={styles.caption}>
          {intl.formatMessage({ id: `comments.emptyFiltered.${filter === 'resolved' ? 'resolved' : 'open'}` })}
        </p>
      )}

      <MarginList
        listRef={list}
        items={[...placed.map(({ id }) => id), ...(hasOrphans ? [labelId] : []), ...trailing]}
        plan={plan}
        beside={beside && marginShown}
        registerCard={registerCard}
        registerLabel={registerLabel}
        renderCard={renderCard}
        onEscape={showInText}
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
