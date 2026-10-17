import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import type { Editor } from '@tiptap/core'
import { Button } from '@yelison/forma-ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { CommentCard, type CommentCardState } from '../../components/CommentCard/CommentCard.tsx'
import { succeeded, type Outcome } from '../../components/CommentCard/outcome.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import { problemMessageId } from '../documents/problemMessage.ts'
import { StateMessage } from '../documents/StateMessage.tsx'
import { shortcutLabel } from '../editor/shortcuts.ts'
import { commentShortcut, type Placement } from './highlightPlugin.ts'
import { NewThreadComposer, type Draft } from './NewThreadComposer.tsx'
import { threadsQuery } from './queries.ts'
import { canComment, canDeleteComment, canEditComment } from './roles.ts'
import { SelectionAction } from './SelectionAction.tsx'
import { ThreadFilter, type ThreadFilterValue } from './ThreadFilter.tsx'
import { useCardActions, type Announcement } from './useCardActions.ts'
import { useFocusPlan } from './useFocusPlan.ts'
import { useSelectionToComment } from './useSelectionToComment.ts'
import { useThreadActions } from './useThreadActions.ts'
import styles from './CommentsTab.module.css'

/** A thread the text asked to show: scrolled to, and, when it was asked for from the keyboard, given the focus. */
export interface Reveal {
  threadId: string
  focus: boolean
  /** Counted, so asking for the same thread twice shows it twice. */
  count: number
}

export interface CommentsTabProps {
  document: Pick<Schema<'Document'>, 'id' | 'workspaceId' | 'role'>
  editor: Editor
  personId: string
  placements: ReadonlyMap<string, Placement>
  activeThreadId: string | null
  onActivate: (threadId: string | null) => void
  draft: Draft | null
  onDraftChange: (body: string) => void
  onDraftEnd: () => void
  onStartDraft: () => void
  reveal: Reveal | null
  onAnnounce: (announcement: Announcement) => void
}

const stateOf = (thread: Schema<'Thread'>, placement: Placement | undefined): CommentCardState =>
  thread.status === 'resolved' ? 'resolved' : placement?.status === 'orphaned' ? 'orphaned' : 'open'

/**
 * The comments of the document: loading, none yet (and how to start), the list under a filter, a failure that can be
 * tried again and, for someone who may not comment, the conversation to read. The threads are all fetched once and the
 * filter only chooses among them, so changing it never waits.
 */
export function CommentsTab({
  document,
  editor,
  personId,
  placements,
  activeThreadId,
  onActivate,
  draft,
  onDraftChange,
  onDraftEnd,
  onStartDraft,
  reveal,
  onAnnounce,
}: CommentsTabProps) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const query = useQuery(threadsQuery(dataSource, document.id))
  const mutations = useThreadActions(document)
  const selection = useSelectionToComment(editor)
  const [filter, setFilter] = useState<ThreadFilterValue>('open')
  const list = useRef<HTMLUListElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const mayComment = canComment(document.role)

  const threads = useMemo(() => query.data ?? [], [query.data])
  const counts = useMemo(
    () => ({
      open: threads.filter((thread) => thread.status === 'open').length,
      resolved: threads.filter((thread) => thread.status === 'resolved').length,
      all: threads.length,
    }),
    [threads],
  )
  const shown = filter === 'all' ? threads : threads.filter((thread) => thread.status === filter)
  // What changes what is on the page: a thread comes or goes, changes its state, or loses a comment.
  const signature = shown.map((thread) => `${thread.id}:${thread.status}:${thread.comments.length}`).join()
  const focusPlan = useFocusPlan(list, heading, signature)

  const actionsFor = useCardActions(mutations, {
    onDone: onAnnounce,
    onBefore: (thread) => focusPlan.keepFocusAround(thread.id),
  })

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
      onActivate(created.id)
      onDraftEnd()
      onAnnounce('created')
      return succeeded
    } catch (error) {
      return { ok: false, message: intl.formatMessage({ id: problemMessageId(error) }) }
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
    card.scrollIntoView({ block: 'nearest' })
    if (reveal.focus) card.focus()
    // A request is acted on once; the threads and the filter it waits for re-run it until the card is there.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [reveal, threads, filter])

  return (
    <div className={styles.tab}>
      <h2 ref={heading} tabIndex={-1} className="forma-visually-hidden">
        {intl.formatMessage({ id: 'comments.tab.comments' })}
      </h2>

      {mayComment ? (
        <SelectionAction selection={selection} onStart={onStartDraft} />
      ) : (
        <p className={styles.notice}>{intl.formatMessage({ id: 'comments.readOnly.notice' })}</p>
      )}

      {draft !== null && (
        <NewThreadComposer
          draft={draft}
          onChange={onDraftChange}
          onSubmit={createThread}
          onCancel={() => {
            onDraftEnd()
            editor.commands.focus()
          }}
        />
      )}

      {query.isPending ? (
        <ListSkeleton rows={3} listClassName={styles.list} label="comments.loading" />
      ) : query.isError ? (
        <StateMessage
          role="alert"
          title={intl.formatMessage({ id: 'comments.error.title' })}
          description={intl.formatMessage({ id: 'comments.error.description' })}
        >
          <Button loading={query.isFetching} onClick={() => void query.refetch()}>
            {intl.formatMessage({ id: 'comments.error.retry' })}
          </Button>
        </StateMessage>
      ) : threads.length === 0 ? (
        <StateMessage
          title={intl.formatMessage({ id: 'comments.empty.title' })}
          description={intl.formatMessage({ id: mayComment ? 'comments.empty.description' : 'comments.empty.reader' })}
        />
      ) : (
        <>
          <ThreadFilter value={filter} counts={counts} onChange={setFilter} />
          {shown.length === 0 && (
            <StateMessage
              title={intl.formatMessage({ id: `comments.emptyFiltered.${filter === 'all' ? 'open' : filter}` })}
            />
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
            {shown.map((thread) => (
              <li key={thread.id} onFocus={() => onActivate(thread.id)}>
                <CommentCard
                  thread={thread}
                  state={stateOf(thread, placements.get(thread.id))}
                  active={thread.id === activeThreadId}
                  mayComment={mayComment}
                  mayEdit={(comment) => canEditComment(document.role, comment, personId)}
                  mayDelete={(comment) => canDeleteComment(document.role, comment, personId)}
                  actions={actionsFor(thread)}
                  {...(stateOf(thread, placements.get(thread.id)) === 'open'
                    ? { onShowInText: () => showInText(thread.id) }
                    : {})}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {mayComment && (
        <p className={styles.notice}>
          {intl.formatMessage({ id: 'comments.shortcuts.hint' }, { shortcut: shortcutLabel(commentShortcut) })}
        </p>
      )}
    </div>
  )
}
