import type { Schema } from '@draftroom/contract'
import { Extension, type Editor } from '@tiptap/core'
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
 * The Yjs document is where a thread is. It is read when the threads change and when the document changed because of
 * someone else (or an undo), which is a transaction of the sync plugin. For the person's own typing the editor's document
 * is ahead of the Yjs one while the transaction is applied (the binding writes it afterwards), so those ranges follow the
 * editor's own mapping, which treats the ends the way the anchor does: text typed at the start or at the end of a range
 * falls outside it.
 */
function highlightPlugin(requests: CommentRequests | null): Plugin<HighlightState> {
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
        if (told !== undefined || byAnotherPerson) {
          return updated(previous, state, input, resolveFromYjs(state, input))
        }
        if (transaction.docChanged)
          return updated(previous, state, input, mapThrough(previous.placements, transaction.mapping))
        return previous
      },
    },
    props: {
      decorations: (state) => highlightKey.getState(state)?.decorations ?? DecorationSet.empty,
      // A click on highlighted text shows its thread. The text keeps the focus and the caret: the click is also an edit.
      handleClick(view, position) {
        const threadId = threadAt(view.state, position, { caret: false })
        if (threadId !== null) requests?.send({ type: 'thread', threadId, focus: false })
        return false
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

/** The extension that puts the plugin, and the key that opens a thread from the text, in the editor. */
export const commentHighlights = Extension.create<CommentHighlightsOptions>({
  name: 'commentHighlights',
  addOptions: () => ({ requests: null }),
  addProseMirrorPlugins() {
    return [highlightPlugin(this.options.requests)]
  },
  addKeyboardShortcuts() {
    return {
      [commentShortcut]: ({ editor }) => {
        const { selection } = editor.state
        // Text that is selected is for a new comment; a caret in a highlight is for its thread.
        const threadId = selection.empty ? threadAt(editor.state, selection.from, { caret: true }) : null
        this.options.requests?.send(threadId === null ? { type: 'comment' } : { type: 'thread', threadId, focus: true })
        return true
      },
    }
  },
})
