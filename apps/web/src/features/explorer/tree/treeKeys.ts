import { isBranch, type TreeItem } from './treeModel.ts'

/** What a key does to the tree. The component applies it: it moves the focus, opens or closes a branch, or opens a document. */
export type TreeAction =
  | { type: 'focus'; key: string }
  | { type: 'expand'; key: string }
  | { type: 'collapse'; key: string }
  | { type: 'activate'; key: string }

export interface TreeKeyContext {
  /** The items that are on screen, in order. */
  items: readonly TreeItem[]
  /** The item that has the focus. */
  current: TreeItem
  isExpanded: (key: string) => boolean
}

/**
 * The keys of the ARIA tree pattern (APG, "Tree View"), as one table:
 *
 * | Key           | On a document          | On a closed branch | On an open branch           |
 * | ------------- | ---------------------- | ------------------ | --------------------------- |
 * | Down arrow    | next item              | next item          | next item (its first child) |
 * | Up arrow      | previous item          | previous item      | previous item               |
 * | Right arrow   | nothing                | opens it           | first child                 |
 * | Left arrow    | its parent             | its parent         | closes it                   |
 * | Home / End    | first / last item      | first / last item  | first / last item           |
 * | Enter / Space | opens the document     | opens it           | closes it                   |
 *
 * The arrows stop at the ends rather than wrapping, and a key that does nothing returns `null` so the page keeps it.
 */
export function actionForKey(key: string, { items, current, isExpanded }: TreeKeyContext): TreeAction | null {
  const index = items.findIndex((item) => item.key === current.key)
  const focus = (target: TreeItem | undefined): TreeAction | null =>
    target === undefined || target.key === current.key ? null : { type: 'focus', key: target.key }

  switch (key) {
    case 'ArrowDown':
      return focus(items[index + 1])
    case 'ArrowUp':
      return focus(items[index - 1])
    case 'Home':
      return focus(items[0])
    case 'End':
      return focus(items.at(-1))
    case 'ArrowRight':
      if (!isBranch(current)) return null
      return isExpanded(current.key) ? focus(items[index + 1]) : { type: 'expand', key: current.key }
    case 'ArrowLeft':
      if (isBranch(current) && isExpanded(current.key)) return { type: 'collapse', key: current.key }
      return focus(items.find((item) => item.key === current.parentKey))
    case 'Enter':
    case ' ':
      if (!isBranch(current)) return { type: 'activate', key: current.key }
      return { type: isExpanded(current.key) ? 'collapse' : 'expand', key: current.key }
    default:
      return null
  }
}

/**
 * The item that type-ahead goes to: the first, after the current one and wrapping, whose label starts with what was
 * typed. A single letter typed again moves on to the next item with that letter, which is how repeating it cycles.
 */
export function typeaheadTarget(
  items: readonly TreeItem[],
  current: TreeItem,
  typed: string,
  locale: string,
): TreeItem | undefined {
  const start = items.findIndex((item) => item.key === current.key)
  const lower = (text: string) => text.toLocaleLowerCase(locale)
  const wanted = lower(typed)
  const repeated = [...wanted].every((letter) => letter === wanted[0])
  const needle = repeated ? (wanted[0] ?? '') : wanted
  // A repeated letter looks past the current item; a longer word may keep the item it is already on.
  const order = [...items.slice(start + (repeated ? 1 : 0)), ...items.slice(0, start + (repeated ? 1 : 0))]
  return order.find((item) => lower(item.label).startsWith(needle))
}
