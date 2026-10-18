import type { Schema } from '@draftroom/contract'
import { Extension, type Editor } from '@tiptap/core'
import { keydownHandler } from '@tiptap/pm/keymap'
import type { Mapping } from '@tiptap/pm/transform'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { boundDocumentOf, resolveAnchor } from './anchors.ts'
import type { CommentRequests } from './commentRequests.ts'
import styles from './highlight.module.css'

/** A thread whose text is to be highlighted: the open ones, which is what the caller passes. */
export interface HighlightedThread {
  id: string
  anchor: Schema<'Anchor'>
}

/**
 * Where a thread is in the text. `unresolved` is the state until the first handshake of the session, and for a thread that
 * is not being tracked: it has no highlight and is not orphaned, so a document that is still loading never flashes
 * orphans (protocol section 10.3).
 */
export type Placement =
  { status: 'unresolved' } | { status: 'orphaned' } | { status: 'placed'; from: number; to: number }

type Placements = ReadonlyMap<string, Placement>

/** What the screen tells the plugin: the threads to show, whether the first handshake is done and the thread in focus. */
interface HighlightInput {
  threads: readonly HighlightedThread[]
  handshaken: boolean
  activeThreadId: string | null
}

interface HighlightState extends HighlightInput {
  placements: Placements
  decorations: DecorationSet
}

const highlightKey = new PluginKey<HighlightState>('comment-highlights')

/** The meta that asks the plugin to read every thread from Yjs again. */
const resolveAgainKey = new PluginKey<true>('comment-highlights-resolve-again')

const unresolved: Placement = { status: 'unresolved' }

/** The open threads among these: a resolved thread has no highlight. */
export function highlightedThreads(
  threads: readonly (HighlightedThread & { status: Schema<'ThreadStatus'> })[],
): HighlightedThread[] {
  return threads.filter(({ status }) => status === 'open').map(({ id, anchor }) => ({ id, anchor }))
}

/** Where a thread is in the text of this editor state. */
export function placementOf(state: EditorState, threadId: string): Placement {
  return highlightKey.getState(state)?.placements.get(threadId) ?? unresolved
}

/** Where every thread being shown is, as one value that changes only when one of them does. */
export function placementsOf(state: EditorState): Placements {
  return highlightKey.getState(state)?.placements ?? new Map()
}

/**
 * Tells the plugin which threads to show, whether the first handshake is done, and which thread the person is on. It is a
 * transaction of its own that changes no content and is not an undo step.
 */
export function showHighlights(
  editor: Editor,
  threads: readonly HighlightedThread[],
  { handshaken, activeThreadId = null }: { handshaken: boolean; activeThreadId?: string | null },
): void {
  const input: HighlightInput = { threads, handshaken, activeThreadId }
  editor.view.dispatch(editor.state.tr.setMeta(highlightKey, input).setMeta('addToHistory', false))
}

/**
 * The highlights of the comment threads, as decorations of the editor and never as marks of the shared document: a
 * commenter, who may not change the content, sees and makes them all the same (protocol section 10.4).
 *
 * The Yjs document is where a thread is, and what the highlight and the card end up as is always what Yjs says. It is read
 * when the threads change, when the document changed because of someone else (or an undo), which is a transaction of the
 * sync plugin, and once the editor has written the person's own typing into Yjs. Until then the editor's own mapping
 * paints the range, so the highlight does not lag a keystroke: it treats the ends the way the anchor does, but where a
 * replaced range meets an end it cannot tell (text typed over a range, or at a start that is tied to no character), so
 * it is only a first drawing.
 *
 * "Once the editor has written" is the next microtask after the transaction: the sync plugin writes in the `update` of
 * its view, which runs inside `dispatch`, before this plugin's own view update. That relies on the collaboration
 * extension coming before this one (it has the higher priority); a test, which types over a range, fails if it did not.
 */
function highlightPlugin(requests: CommentRequests | null): Plugin<HighlightState> {
  const commentKey = keydownHandler({
    [commentShortcut]: (state) => {
      const { selection } = state
      // Text that is selected is for a new comment; a caret in a highlight is for its thread.
      const threadId = selection.empty ? threadAt(state, selection.from, { caret: true }) : null
      requests?.send(threadId === null ? { type: 'comment' } : { type: 'thread', threadId, focus: true })
      return true
    },
  })

  return new Plugin<HighlightState>({
    key: highlightKey,
    state: {
      init: () => ({
        threads: [],
        handshaken: false,
        activeThreadId: null,
        placements: new Map(),
        decorations: DecorationSet.empty,
      }),
      apply(transaction, previous, _oldState, state) {
        const told = transaction.getMeta(highlightKey) as HighlightInput | undefined
        const input = told ?? previous
        const byAnotherPerson = transaction.docChanged && ySyncPluginKey.getState(state)?.isChangeOrigin === true
        const asked = transaction.getMeta(resolveAgainKey) === true
        if (told !== undefined || byAnotherPerson || asked) {
          return updated(previous, state, input, resolveFromYjs(state, input))
        }
        if (transaction.docChanged)
          return updated(previous, state, input, mapThrough(previous.placements, transaction.mapping))
        return previous
      },
    },
    view: () => ({
      update(view, previousState) {
        const own = view.state.doc !== previousState.doc && ySyncPluginKey.getState(view.state)?.isChangeOrigin !== true
        if (!own) return
        // The sync plugin has written the typing into Yjs by the time this runs; the dispatch waits for the end of the
        // update that is under way, since a view cannot take a transaction while it is being updated.
        queueMicrotask(() => {
          if (!view.isDestroyed)
            view.dispatch(view.state.tr.setMeta(resolveAgainKey, true).setMeta('addToHistory', false))
        })
      },
    }),
    props: {
      decorations: (state) => highlightKey.getState(state)?.decorations ?? DecorationSet.empty,
      // A click on highlighted text shows its thread. The text keeps the focus and the caret: the click is also an edit.
      handleClick(view, position) {
        const threadId = threadAt(view.state, position, { caret: false })
        if (threadId !== null) requests?.send({ type: 'thread', threadId, focus: false })
        return false
      },
      // A DOM handler, not `handleKeyDown`: ProseMirror runs that one only while the text is editable, and a commenter's
      // is not. This one runs for every role. ProseMirror cancels the event of a key that `handleKeyDown` took, and does
      // not for this one, so the handler does it: on a Mac the browser would otherwise go on to do what it does with the key.
      handleDOMEvents: {
        keydown(view, event) {
          const taken = commentKey(view, event)
          if (taken) event.preventDefault()
          return taken
        },
      },
    },
  })
}

/** The state for these placements; the previous one itself when nothing in it changed, so nothing that reads it re-renders. */
function updated(
  previous: HighlightState,
  state: EditorState,
  input: HighlightInput,
  placements: Placements,
): HighlightState {
  const unchanged =
    input.threads === previous.threads &&
    input.handshaken === previous.handshaken &&
    input.activeThreadId === previous.activeThreadId &&
    samePlacements(placements, previous.placements)
  if (unchanged) return previous
  return { ...input, placements, decorations: decorationsOf(state, placements, input.activeThreadId) }
}

function resolveFromYjs(state: EditorState, { threads, handshaken }: HighlightInput): Placements {
  const bound = boundDocumentOf(state)
  return new Map(
    threads.map(({ id, anchor }): [string, Placement] => {
      if (!handshaken || bound === null) return [id, unresolved]
      const range = resolveAnchor(bound, anchor)
      return [id, range === null ? { status: 'orphaned' } : { status: 'placed', ...range }]
    }),
  )
}

/** The start moves on when text is typed at it and the end stays before it: the same association as the anchor's ends. */
function mapThrough(placements: Placements, mapping: Mapping): Placements {
  return new Map(
    [...placements].map(([id, placement]): [string, Placement] => {
      if (placement.status !== 'placed') return [id, placement]
      const from = mapping.map(placement.from, 1)
      const to = mapping.map(placement.to, -1)
      return [id, from >= to ? { status: 'orphaned' } : { status: 'placed', from, to }]
    }),
  )
}

function decorationsOf(state: EditorState, placements: Placements, activeThreadId: string | null): DecorationSet {
  const marks = [...placements].flatMap(([id, placement]) =>
    placement.status === 'placed'
      ? [
          Decoration.inline(
            placement.from,
            placement.to,
            {
              nodeName: 'mark',
              class: styles.highlight ?? '',
              'data-comment-thread': id,
              ...(id === activeThreadId ? { 'data-active': 'true' } : {}),
            },
            { inclusiveStart: false, inclusiveEnd: false },
          ),
        ]
      : [],
  )
  return DecorationSet.create(state.doc, marks)
}

function samePlacements(a: Placements, b: Placements): boolean {
  if (a.size !== b.size) return false
  return [...a].every(([id, placement]) => {
    const other = b.get(id)
    if (other === undefined || other.status !== placement.status) return false
    return (
      placement.status !== 'placed' ||
      (other.status === 'placed' && other.from === placement.from && other.to === placement.to)
    )
  })
}

/**
 * The thread whose highlight covers a position of the text, the narrowest one where several do, or `null`. The end of a
 * range is outside it for a click, as it is for the text typed there, and inside it for a caret, which touches the
 * highlight when it is at its end.
 */
export function threadAt(state: EditorState, position: number, { caret }: { caret: boolean }): string | null {
  let found: { id: string; length: number } | null = null
  for (const [id, placement] of placementsOf(state)) {
    if (placement.status !== 'placed' || position < placement.from) continue
    if (caret ? position > placement.to : position >= placement.to) continue
    const length = placement.to - placement.from
    if (found === null || length < found.length) found = { id, length }
  }
  return found?.id ?? null
}

/** The key that comments on the selection or, with the caret in a highlight, takes the person to its thread. */
export const commentShortcut = 'Mod-Alt-m'

export interface CommentHighlightsOptions {
  /** Where the clicks and the key of the text are sent; without it they do nothing. */
  requests: CommentRequests | null
}

/** The extension that puts the plugin in the editor: its highlights, its clicks and the key that opens a thread. */
export const commentHighlights = Extension.create<CommentHighlightsOptions>({
  name: 'commentThreads',
  addOptions: () => ({ requests: null }),
  addProseMirrorPlugins() {
    return [highlightPlugin(this.options.requests)]
  },
})
