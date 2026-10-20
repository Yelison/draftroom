/** A run of a text, and whether the search matched it. */
export interface TextChunk {
  text: string
  match: boolean
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** The characters a letter lowercases to, one by one: a few lowercase to more than one (`İ`), so the text and the term are
 * compared as lists of code points rather than as strings whose indexes would drift from the original's. */
const foldedPoints = (point: string) => [...point.toLowerCase()]

/**
 * Cuts `text` into the runs that match `term` and the runs between them, so a screen can mark the matches without ever
 * turning the text into markup. The runs joined are always the text.
 *
 * It follows the server, which finds `term` with `strpos(lower(text), lower(term))`: any case, accents told apart ("cafe"
 * is not in "café", and neither does the server find it). Every match is whole graphemes: the server finds "e" inside
 * "e" + a combining acute, and a mark on half of a letter or of an emoji would not be one.
 */
export function splitByTerm(text: string, term: string): TextChunk[] {
  const points = [...text]
  const wanted = [...term].flatMap(foldedPoints)
  if (wanted.length === 0) return text === '' ? [] : [{ text, match: false }]

  const folded = points.flatMap((point, owner) => foldedPoints(point).map((value) => ({ value, owner })))
  const boundaries = graphemeBoundaries(text, points)

  const ranges: [start: number, end: number][] = []
  for (let from = 0; from + wanted.length <= folded.length;) {
    const last = from + wanted.length - 1
    if (!wanted.every((value, offset) => folded[from + offset]?.value === value)) {
      from++
      continue
    }
    let start = folded[from]?.owner ?? 0
    let end = (folded[last]?.owner ?? 0) + 1
    while (!boundaries[start]) start--
    while (!boundaries[end]) end++
    ranges.push([start, end])
    // The next match starts after this one, so "aa" in "aaaa" is two marks and no code point is in two of them.
    from = folded.findIndex((entry, index) => index > last && entry.owner >= end)
    if (from < 0) break
  }

  const chunks: TextChunk[] = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (start > cursor) chunks.push({ text: points.slice(cursor, start).join(''), match: false })
    chunks.push({ text: points.slice(start, end).join(''), match: true })
    cursor = end
  }
  if (cursor < points.length) chunks.push({ text: points.slice(cursor).join(''), match: false })
  return chunks
}

/** Whether each index of `points` (and the end of the list) is where a grapheme starts. */
function graphemeBoundaries(text: string, points: readonly string[]): boolean[] {
  const starts = new Set<number>()
  for (const { index } of graphemes.segment(text)) starts.add(index)
  const boundaries: boolean[] = []
  let offset = 0
  for (const point of points) {
    boundaries.push(starts.has(offset))
    offset += point.length
  }
  boundaries.push(true)
  return boundaries
}
