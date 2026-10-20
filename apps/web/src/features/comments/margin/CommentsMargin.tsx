import type { Schema } from '@draftroom/contract'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useQuery } from '@tanstack/react-query'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { Button } from '@yelison/forma-ui'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { useNarrowWindow } from '../../../app/narrowWindow.ts'
import { CommentCard, type CommentCardState } from '../../../components/CommentCard/CommentCard.tsx'
import { succeeded, type Outcome } from '../../../components/CommentCard/outcome.ts'
import { useDataSource } from '../../../data/useDataSource.ts'
import { StateMessage } from '../../documents/StateMessage.tsx'
import { boundDocumentOf, createAnchor, quoteOf, resolveAnchor } from '../anchors.ts'
import type { CommentRequest, CommentRequests } from '../commentRequests.ts'
import { commentsMarginId, useCommentsView } from '../commentsView.ts'
import { highlightedThreads, resolvedThreads, showHighlights, type Placement } from '../highlightPlugin.ts'
import { NewThreadComposer, type Draft } from '../NewThreadComposer.tsx'
import { threadsQuery } from '../queries.ts'
import { canComment, canDeleteComment, canEditComment } from '../roles.ts'
import { SelectionAction } from '../SelectionAction.tsx'
import { failedOutcome, useCardActions, type Announcement } from '../useCardActions.ts'
import { useFirstHandshake } from '../useFirstHandshake.ts'
import { useFocusPlan } from '../useFocusPlan.ts'
import { usePlacements } from '../usePlacements.ts'
import { useSelectionToComment } from '../useSelectionToComment.ts'
import { useThreadActions } from '../useThreadActions.ts'
import { anchorTop } from './anchorTop.ts'
import { arrangeThreads } from './arrangeThreads.ts'
import { CompactThread } from './CompactThread.tsx'
import { useMarginLayout } from './useMarginLayout.ts'
import styles from './CommentsMargin.module.css'

/** A thread the text asked to show: scrolled to, and, when it was asked for from the keyboard, given the focus. */
interface Reveal {
  threadId: string
  focus: boolean
  /** Counted, so asking for the same thread twice shows it twice. */
  count: number
}

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
  const [draft, setDraft] = useState<Draft | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [announcement, setAnnouncement] = useState<{ id: Announcement; count: number } | null>(null)
  // Counted, so each request puts the focus in the form again, also when it was already open.
  const [composerFocus, setComposerFocus] = useState(0)
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

  // Where the comment being written is on the text, which its anchor says: what is typed meanwhile moves it.
  const draftFrom = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const bound = boundDocumentOf(current.state)
      if (draft === null || bound === null) return null
      return resolveAnchor(bound, draft.anchor)?.from ?? null
    },
  })
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
  })

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

  const activate = useCallback(
    (threadId: string, { focus }: { focus: boolean }) => {
      setActiveThread(document.id, threadId)
      if (focus) setReveal((previous) => ({ threadId, focus, count: (previous?.count ?? 0) + 1 }))
    },
    [document.id, setActiveThread],
  )

  function startDraft() {
    const { from, to, empty } = editor.state.selection
    const bound = boundDocumentOf(editor.state)
    if (empty || bound === null || !mayComment) return
    const quote = quoteOf(editor.state.doc, from, to)
    if (quote.trim() === '') return
    const anchor = createAnchor(bound, from, to)
    // What was already written belongs to the person, not to the selection: it stays, and the comment is about the new one.
    setDraft((current) => ({ anchor, quote, body: current?.body ?? '' }))
    // Said only when it is about something else: asking again for the same selection changes nothing to announce.
    if (draft !== null && (draft.anchor.start !== anchor.start || draft.anchor.end !== anchor.end))
      announce('quoteChanged')
    setComposerFocus((count) => count + 1)
    setTab('comments')
  }

  // What the text asks of the margin. It reads the draft and the editor as they are when it is asked, which the effect that
  // listens must not depend on: it would listen again, and miss a request in between, with every keystroke.
  const answer = useEffectEvent((request: CommentRequest) => {
    // Shown in the same render that asks for the focus of the form or the thread, so what is to take it is on screen.
    showMargin()
    if (request.type === 'comment') return startDraft()
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
      focusPlan.focusWhenItArrives(created.id)
      setFilter('open')
      activate(created.id, { focus: false })
      setDraft(null)
      announce('created')
      return succeeded
    } catch (error) {
      return failedOutcome(intl, error)
    }
  }

  // The text asked for a thread: it is brought into view, and given the focus if it was asked for from the keyboard. A
  // filter that hides it is changed first, so the person is never told to look for something they cannot see.
  const revealed = useRef<Reveal | null>(null)
  useEffect(() => {
    if (reveal === null || revealed.current === reveal) return
    const thread = threads.find((row) => row.id === reveal.threadId)
    if (thread === undefined) return
    if (filter !== 'all' && thread.status !== filter) {
      // A request from the text is the one reason to leave the filter the person chose.
      // oxlint-disable-next-line react/set-state-in-effect
      setFilter(thread.status)
      return
    }
    const card = list.current?.querySelector<HTMLElement>(`[data-thread-id="${CSS.escape(reveal.threadId)}"]`)
    if (card === null || card === undefined) return
    revealed.current = reveal
    if (reveal.focus) card.focus({ preventScroll: true })
    // The margin puts the card level with its text in the layout of this render, which the browser has not applied yet.
    requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest' }))
    // A request is acted on once; the threads and the filter it waits for re-run it until the card is there.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [reveal, threads, filter])

  const selectionTop = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const origin = margin.current?.getBoundingClientRect().top
      const { from, empty } = current.state.selection
      const top = empty ? null : anchorTop(current, from)
      return origin === undefined || top === null ? null : Math.round(top - origin)
    },
  })

  const cardOf = (thread: Schema<'Thread'>) => {
    const state = stateOf(thread, placements.get(thread.id))
    return thread.id === activeThreadId ? (
      <CommentCard
        thread={thread}
        state={state}
        active
        mayComment={mayComment}
        mayEdit={(comment) => canEditComment(document.role, comment, personId)}
        mayDelete={(comment) => canDeleteComment(document.role, comment, personId)}
        actions={actionsFor(thread)}
        {...(state === 'open' ? { onShowInText: () => showInText(thread.id) } : {})}
      />
    ) : (
      <CompactThread thread={thread} state={state} onActivate={() => activate(thread.id, { focus: true })} />
    )
  }

  const composer = draft !== null && (
    <NewThreadComposer
      draft={draft}
      focusRequest={composerFocus}
      onChange={(body) => setDraft((current) => (current === null ? null : { ...current, body }))}
      onSubmit={createThread}
      onCancel={() => {
        setDraft(null)
        editor.commands.focus()
      }}
    />
  )

  const itemOf = (id: string, content: ReactNode) => {
    const top = plan?.tops.get(id)
    return (
      <li
        key={id}
        ref={registerCard(id)}
        className={styles.item}
        // Until the page has been measured the cards are in it, so they can be, and nobody sees them in the wrong place.
        data-measuring={beside && marginShown && plan === null ? '' : undefined}
        style={beside && top !== undefined ? { insetBlockStart: top } : undefined}
      >
        {content}
      </li>
    )
  }
  const threadById = new Map(
    [...arranged.placed.map(({ thread }) => thread), ...arranged.orphaned, ...arranged.waiting].map((thread) => [
      thread.id,
      thread,
    ]),
  )
  const order = [...placed.map(({ id }) => id), ...trailing]

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
          <SelectionAction onStart={startDraft} composing={draft !== null} />
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
      {!query.isError && threads.length > 0 && shownCount === 0 && draft === null && (
        <p className={styles.caption}>
          {intl.formatMessage({ id: `comments.emptyFiltered.${filter === 'resolved' ? 'resolved' : 'open'}` })}
        </p>
      )}

      <ul
        ref={list}
        className={styles.list}
        aria-label={intl.formatMessage({ id: 'comments.threads.label' })}
        onKeyDown={(event) => {
          const card = (event.target as HTMLElement).closest<HTMLElement>('[data-thread-id]')
          // Escape in a field is for the field; anywhere else in a card it takes the person back to the text.
          if (event.key !== 'Escape' || card === null || event.target instanceof HTMLTextAreaElement) return
          showInText(card.dataset['threadId'] ?? '')
        }}
      >
        {order.flatMap((id) => {
          if (id === draftId) return [itemOf(id, composer)]
          const thread = threadById.get(id)
          return thread === undefined ? [] : [itemOf(id, cardOf(thread))]
        })}
      </ul>
      {hasOrphans && (
        <p
          ref={registerLabel}
          aria-hidden="true"
          className={styles.label}
          style={beside && plan?.labelTop != null ? { insetBlockStart: plan.labelTop } : undefined}
        >
          {intl.formatMessage({ id: 'comments.margin.orphans' })}
        </p>
      )}

      {/* Heard, not seen. In the page before anything is said in it: a region that arrives with its text is not announced. */}
      <p role="status" className="forma-visually-hidden">
        {announcement !== null && (
          <span key={announcement.count}>{intl.formatMessage({ id: `comments.announce.${announcement.id}` })}</span>
        )}
      </p>
    </aside>
  )
}
