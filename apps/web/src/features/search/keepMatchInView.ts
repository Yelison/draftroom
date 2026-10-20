import { graphemes } from './graphemes.ts'
import type { TextChunk } from './splitByTerm.ts'

const isSpace = (character: string | undefined) => character !== undefined && /^\s+$/u.test(character)

/** The ellipsis that says the start of a text was left out. */
export const omission = '…'

/**
 * Drops the start of a text that comes before its first match, down to `lead` characters of it, with an ellipsis in its
 * place, starting at a word. A line that is cut at its end (every excerpt is) would otherwise hide a match that is far into it, and a mark
 * nobody can see explains nothing. A text with no match, or whose first match is near enough, is returned as it is.
 */
export function keepMatchInView(chunks: readonly TextChunk[], lead: number): TextChunk[] {
  const [first, ...rest] = chunks
  if (first === undefined || first.match) return [...chunks]
  const characters = [...graphemes.segment(first.text)]
  // The first chunk is not a match, so a match, if there is one, is the next.
  if (rest.length === 0 || characters.length <= lead) return [...chunks]
  const kept = characters.slice(-lead).map(({ segment }) => segment)
  const cutInsideWord = !isSpace(characters[characters.length - lead - 1]?.segment) && !isSpace(kept[0])
  // A word that starts before the cut is left out whole.
  const start = cutInsideWord ? kept.findIndex(isSpace) + 1 : 0
  // The ellipsis stands where the text was cut, so the space the cut fell on is not kept after it.
  const firstLetter = kept.findIndex((character) => !isSpace(character))
  const shown = kept.slice(Math.max(start, firstLetter))
  return [{ text: `${omission}${shown.join('')}`, match: false }, ...rest]
}
