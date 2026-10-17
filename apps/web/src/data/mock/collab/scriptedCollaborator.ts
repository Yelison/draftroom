import * as Y from 'yjs'
import { fragmentName } from '@draftroom/editor-schema'
import type { ScriptLine } from '../fixtures/collaboratorScripts.ts'

/**
 * A person in the demo who is writing in a document while the visitor reads: she moves her cursor, types a line at the
 * pace of someone thinking, deletes the end of it and writes it again, and erases it before the next one. All of it is
 * ordinary Yjs edits through her own connection, so the editor shows her as it shows anyone.
 *
 * She writes in one paragraph, the last of the document, and nowhere else, and she never types while someone else's
 * cursor is in it: a visitor who is writing is never touched. The pace and the choice of where to look are a script and
 * a source of randomness that the caller gives, so a test runs the whole of it on fake timers.
 */

/** What she needs of the document she is in. */
export interface CollaboratorSeat {
  readonly ydoc: Y.Doc
  /** Where the cursors of the other people in the document are, as the relative positions the editor publishes. */
  otherCursors(): readonly unknown[]
  /** Publishes where her own cursor is. */
  showCursor(position: Y.RelativePosition): void
}

export interface CollaboratorEnvironment {
  random(): number
  /** Whether the person asked for less motion: she is then present and still, and writes nothing. */
  reducedMotion(): boolean
}

type Action =
  | { readonly kind: 'insert'; readonly character: string }
  | { readonly kind: 'delete' }
  | { readonly kind: 'look'; readonly at: 'her-paragraph' | 'elsewhere' }
  | { readonly kind: 'rest' }

interface Step {
  readonly action: Action
  /** How long she waits before doing it. */
  readonly after: number
}

/** The milliseconds of a person: between letters, after a word, thinking, and before she starts. */
const pace = {
  typing: [70, 150],
  afterWord: [0, 220],
  thinking: [1800, 3200],
  deleting: [40, 90],
  entering: [2500, 4000],
}

/** How long she waits before trying again when someone's cursor is in her paragraph. */
const RETRY_MS = 500

/** The paragraph she writes in: the last of the document, when it is plain text. `undefined` until the document has one. */
function paragraphOf(ydoc: Y.Doc): Y.XmlText | undefined {
  const fragment = ydoc.getXmlFragment(fragmentName)
  const last = fragment.length === 0 ? undefined : fragment.get(fragment.length - 1)
  const text = last instanceof Y.XmlElement ? last.get(0) : undefined
  return text instanceof Y.XmlText ? text : undefined
}

/** The paragraphs she can look at, which are not hers. */
function otherParagraphs(ydoc: Y.Doc, hers: Y.XmlText): Y.XmlText[] {
  return ydoc
    .getXmlFragment(fragmentName)
    .toArray()
    .flatMap((node) => (node instanceof Y.XmlElement ? [node.get(0)] : []))
    .filter((text): text is Y.XmlText => text instanceof Y.XmlText && text !== hers && text.length > 0)
}

const isGone = (text: Y.XmlText) => text._item?.deleted === true

/** Whether the cursor of anyone else is in her paragraph, or in the paragraph element that holds it. */
function someoneIsIn(seat: CollaboratorSeat, hers: Y.XmlText): boolean {
  return seat.otherCursors().some((cursor) => {
    try {
      const position = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(cursor), seat.ydoc)
      return position !== null && (position.type === hers || position.type === hers.parent)
    } catch {
      // A cursor that is not a position of this document says nothing about where its person is.
      return false
    }
  })
}

const writesInText = ({ kind }: Action) => kind === 'insert' || kind === 'delete'

function commonPrefixLength(a: string, b: string): number {
  let length = 0
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1
  return length
}

/**
 * Puts her in the document and starts the script. Returns what stops it; she goes on until it is called. With reduced
 * motion she only takes her place.
 */
export function startCollaborator(
  seat: CollaboratorSeat,
  lines: readonly ScriptLine[],
  environment: CollaboratorEnvironment,
): () => void {
  const between = ([from, to]: number[]) => (from ?? 0) + environment.random() * ((to ?? 0) - (from ?? 0))
  const queue: Step[] = []
  let nextLine = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let hers: Y.XmlText | undefined

  const rest = (): Step => ({ action: { kind: 'rest' }, after: between(pace.thinking) })
  const typed = (text: string): Step[] =>
    [...text].map((character) => ({
      action: { kind: 'insert', character },
      after: between(pace.typing) + (character === ' ' ? between(pace.afterWord) : 0),
    }))
  const erased = (count: number): Step[] =>
    Array.from({ length: count }, () => ({ action: { kind: 'delete' }, after: between(pace.deleting) }))

  function planLine({ draft, final }: ScriptLine): Step[] {
    const kept = commonPrefixLength(draft, final)
    return [
      { action: { kind: 'look', at: 'elsewhere' }, after: between(pace.thinking) },
      { action: { kind: 'look', at: 'her-paragraph' }, after: between(pace.thinking) },
      ...typed(draft),
      rest(),
      ...erased(draft.length - kept),
      ...typed(final.slice(kept)),
      rest(),
      ...erased(final.length),
    ]
  }

  const show = (text: Y.XmlText, index: number) =>
    seat.showCursor(Y.createRelativePositionFromTypeIndex(text, Math.min(index, text.length)))

  function perform(action: Action, text: Y.XmlText): void {
    switch (action.kind) {
      case 'insert':
        seat.ydoc.transact(() => text.insert(text.length, action.character), seat)
        show(text, text.length)
        break
      case 'delete':
        if (text.length > 0) seat.ydoc.transact(() => text.delete(text.length - 1, 1), seat)
        show(text, text.length)
        break
      case 'look': {
        if (action.at === 'her-paragraph') return show(text, text.length)
        const others = otherParagraphs(seat.ydoc, text)
        const target = others[Math.floor(environment.random() * others.length)]
        if (target !== undefined) show(target, Math.floor(environment.random() * target.length))
        break
      }
      case 'rest':
        break
    }
  }

  function refill(): void {
    const line = lines[nextLine % lines.length]
    nextLine += 1
    if (line !== undefined) queue.push(...planLine(line))
  }

  function schedule(delay: number): void {
    timer = setTimeout(tick, delay)
  }

  // Each step is waited for before it is done, so the step that follows is the one the next tick waits for.
  function tick(): void {
    hers ??= paragraphOf(seat.ydoc)
    // The document has not arrived yet, or has no paragraph to write in: she waits for it.
    if (hers === undefined) return schedule(RETRY_MS)
    if (isGone(hers)) return
    if (queue.length === 0) refill()
    const step = queue[0]
    if (step === undefined) return
    // Someone who is writing where she would is waited for, and the step is kept for later.
    if (writesInText(step.action) && someoneIsIn(seat, hers)) return schedule(RETRY_MS)
    queue.shift()
    perform(step.action, hers)
    if (queue.length === 0) refill()
    schedule(queue[0]?.after ?? RETRY_MS)
  }

  if (environment.reducedMotion()) {
    // Present and still: her cursor is where she would start, and nothing is written.
    timer = setTimeout(() => {
      const text = paragraphOf(seat.ydoc)
      if (text !== undefined) show(text, text.length)
    }, 0)
  } else {
    schedule(between(pace.entering))
  }
  return () => clearTimeout(timer)
}
