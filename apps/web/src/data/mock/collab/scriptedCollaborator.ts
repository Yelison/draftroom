import * as Y from 'yjs'
import { fragmentName } from '@draftroom/editor-schema'
import type { ScriptLine } from '../fixtures/collaboratorScripts.ts'

/**
 * A person in the demo who is writing in a document while the visitor reads: she moves her cursor, types a line at the
 * pace of someone thinking, deletes the end of it and writes it again, and erases it before the next one. All of it is
 * ordinary Yjs edits through her own connection, so the editor shows her as it shows anyone.
 *
 * She writes in one paragraph, the last of the document, and nowhere else, and she only ever adds and removes her own
 * letters: she remembers where each one is, so what a visitor wrote beside them is never hers to delete. She never types
 * while someone else's cursor is in the paragraph, and when someone has written in or after her line she gives it up,
 * erases what is hers once the paragraph is free and goes on to the next. When she is stopped she leaves the paragraph as
 * she found it. The pace and the choice of where to look are a script and a source of randomness that the caller gives,
 * so a test runs the whole of it on fake timers.
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

type Range = readonly [from: number, to: number]

/** The milliseconds of a person: between letters, after a word, thinking, deleting and before she starts. */
const pace = {
  typing: [70, 150],
  afterWord: [0, 220],
  thinking: [1800, 3200],
  deleting: [40, 90],
  entering: [2500, 4000],
} as const satisfies Record<string, Range>

/** How long she waits before trying again: when someone's cursor is in her paragraph, or the document has no paragraph yet. */
const RETRY_MS = 500

/** The paragraph she writes in: the last block of the document, when it is a paragraph of plain text. `undefined` until the document has one. */
function paragraphOf(ydoc: Y.Doc): Y.XmlText | undefined {
  const fragment = ydoc.getXmlFragment(fragmentName)
  const last = fragment.length === 0 ? undefined : fragment.get(fragment.length - 1)
  const text = last instanceof Y.XmlElement && last.nodeName === 'paragraph' ? last.get(0) : undefined
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

function commonPrefixLength(a: string, b: string): number {
  let length = 0
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1
  return length
}

const writesInText = ({ kind }: Action) => kind === 'insert' || kind === 'delete'

/**
 * Puts her in the document and starts the script. Returns what stops it, which also takes her letters out of the
 * paragraph. With reduced motion she only takes her place.
 */
export function startCollaborator(
  seat: CollaboratorSeat,
  lines: readonly ScriptLine[],
  environment: CollaboratorEnvironment,
): () => void {
  const between = ([from, to]: Range) => from + environment.random() * (to - from)
  const queue: Step[] = []
  let nextLine = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let hers: Y.XmlText | undefined
  /** Where each of her letters is, in the order she wrote them: a position follows its letter wherever the text goes. */
  const mine: Y.RelativePosition[] = []
  /** Whether she is taking back a line that someone wrote in or after, and so writes nothing new. */
  let givingUp = false

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

  // --- Her letters ------------------------------------------------------------------------------------------------

  /** Where a letter of hers is now, or `undefined` when it was deleted. */
  function indexOf(letter: Y.RelativePosition): number | undefined {
    const item = letter.item === null ? undefined : Y.getItem(seat.ydoc.store, letter.item)
    if (item === undefined || item.deleted) return undefined
    return Y.createAbsolutePositionFromRelativePosition(letter, seat.ydoc)?.index
  }

  /** Whether her letters are still one run that ends the paragraph: nobody wrote inside it or after it. */
  function isIntact(text: Y.XmlText): boolean {
    const indexes = mine.map(indexOf)
    const isRun = indexes.every(
      (index, at) => index !== undefined && (at === 0 || index === (indexes[at - 1] ?? 0) + 1),
    )
    return isRun && (indexes.at(-1) ?? text.length - 1) === text.length - 1
  }

  /** A new letter goes at the end of the paragraph, which is right after her last one while she is intact. */
  function write(text: Y.XmlText, character: string): void {
    const index = text.length
    seat.ydoc.transact(() => text.insert(index, character), seat)
    // The position at the index of what was just inserted is the position of that letter.
    mine.push(Y.createRelativePositionFromTypeIndex(text, index))
  }

  function eraseLast(text: Y.XmlText): void {
    const letter = mine.pop()
    const index = letter === undefined ? undefined : indexOf(letter)
    if (index !== undefined) seat.ydoc.transact(() => text.delete(index, 1), seat)
  }

  const show = (text: Y.XmlText, index: number) =>
    seat.showCursor(Y.createRelativePositionFromTypeIndex(text, Math.min(index, text.length)))

  function perform(action: Action, text: Y.XmlText): void {
    switch (action.kind) {
      case 'insert':
        write(text, action.character)
        show(text, text.length)
        break
      case 'delete':
        eraseLast(text)
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

  // --- The script -------------------------------------------------------------------------------------------------

  function refill(): void {
    const line = lines[nextLine % lines.length]
    nextLine += 1
    if (line !== undefined) queue.push(...planLine(line))
  }

  function schedule(delay: number): void {
    timer = setTimeout(tick, delay)
  }

  /** What she was doing is over: the paragraph she wrote in is gone (deleted, or replaced by a restored version). */
  function forgetParagraph(): void {
    hers = undefined
    mine.length = 0
    queue.length = 0
    givingUp = false
  }

  // Each step is waited for before it is done, so the step that follows is the one the next tick waits for.
  function tick(): void {
    if (hers !== undefined && isGone(hers)) forgetParagraph()
    hers ??= paragraphOf(seat.ydoc)
    // The document has not arrived yet, or has no paragraph to write in: she waits for it.
    if (hers === undefined) return schedule(RETRY_MS)
    if (!givingUp && mine.length > 0 && !isIntact(hers)) {
      givingUp = true
      queue.length = 0
      queue.push(...erased(mine.length))
    }
    if (queue.length === 0) refill()
    const step = queue[0]
    if (step === undefined) return
    // Someone who is writing where she would is waited for, and the step is kept for later.
    if (writesInText(step.action) && someoneIsIn(seat, hers)) return schedule(RETRY_MS)
    queue.shift()
    perform(step.action, hers)
    if (mine.length === 0) givingUp = false
    if (queue.length === 0) refill()
    schedule(queue[0]?.after ?? RETRY_MS)
  }

  /** Present and still: her cursor is where she would start, and nothing is written. */
  function takePlace(): void {
    const text = paragraphOf(seat.ydoc)
    if (text === undefined) timer = setTimeout(takePlace, RETRY_MS)
    else show(text, text.length)
  }

  if (environment.reducedMotion()) timer = setTimeout(takePlace, 0)
  else schedule(between(pace.entering))

  return () => {
    clearTimeout(timer)
    if (hers === undefined || isGone(hers)) return
    const text = hers
    const letters = mine.flatMap((letter) => indexOf(letter) ?? [])
    seat.ydoc.transact(() => {
      for (const index of letters.sort((a, b) => b - a)) text.delete(index, 1)
    }, seat)
    mine.length = 0
  }
}
