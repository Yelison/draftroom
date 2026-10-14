import { headingLevels } from './levels.ts'

/** The start of a numbered list: a whole number a person could type, not `1e20` or `-5`. */
export const listStart = { min: 0, max: 999_999 } as const

/** The numbering styles of an ordered list (HTML's `type`). `null` is the default, decimal. */
const orderedListTypes: readonly unknown[] = ['1', 'a', 'A', 'i', 'I', null]

export const isListStart = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= listStart.min && value <= listStart.max

const clampLevel = (level: unknown): number => {
  const [lowest, highest] = [headingLevels[0], headingLevels[headingLevels.length - 1] ?? headingLevels[0]]
  if (typeof level !== 'number' || !Number.isInteger(level)) return lowest
  return Math.min(Math.max(level, lowest), highest)
}

/**
 * The attributes the schema's nodes may hold, as rules the schema itself cannot state: it gives each attribute a default
 * and nothing more, and ProseMirror builds a node's attributes from whatever it is handed (a pasted clipboard slice, a
 * command, a transaction) without asking the HTML rules that limit them. `null` means the attributes are fine.
 */
export function attributeProblem(type: string, attrs: Readonly<Record<string, unknown>>): string | null {
  if (type === 'heading' && !headingLevels.some((level) => level === attrs.level)) {
    return `A heading has level ${String(attrs.level)}, and only ${headingLevels.join(' and ')} are allowed`
  }
  if (type === 'orderedList') {
    if (!isListStart(attrs.start))
      return `A numbered list starts at ${String(attrs.start)}, which is not a whole number from ${listStart.min} to ${listStart.max}`
    if (!orderedListTypes.includes(attrs.type)) return `A numbered list has the numbering style ${String(attrs.type)}`
  }
  return null
}

/** The attributes with what `attributeProblem` finds put right, or `null` when there is nothing to put right. */
export function normalizedAttributes(
  type: string,
  attrs: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null {
  if (attributeProblem(type, attrs) === null) return null
  if (type === 'heading') return { ...attrs, level: clampLevel(attrs.level) }
  return {
    ...attrs,
    start: isListStart(attrs.start) ? attrs.start : 1,
    type: orderedListTypes.includes(attrs.type) ? attrs.type : null,
  }
}
