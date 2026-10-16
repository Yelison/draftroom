import type { BadgeTone } from '@yelison/forma-ui'

/**
 * How a person looks to the others in a document: one colour for their caret and one tone for their avatar, both
 * taken from their id so they are the same in every browser without anyone choosing them.
 *
 * The caret colour travels in the awareness state, which is read by browsers in either theme, so it is a literal colour
 * and not a token; each one holds white text at 4.5:1 or more. The server relays only a plain `#rrggbb`.
 */
const looks: readonly { color: string; tone: BadgeTone }[] = [
  { color: '#1d4ed8', tone: 'blue' },
  { color: '#15803d', tone: 'green' },
  { color: '#b45309', tone: 'amber' },
  { color: '#b91c1c', tone: 'red' },
  { color: '#7e22ce', tone: 'purple' },
]

export function presenceLookOf(userId: string): { color: string; tone: BadgeTone } {
  let hash = 0
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return looks[hash % looks.length] ?? { color: '#1d4ed8', tone: 'blue' }
}
