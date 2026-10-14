import { describe, expect, it } from 'vitest'
import { sampleTree } from './sampleTree.ts'
import { actionForKey, typeaheadTarget, type TreeAction } from './treeKeys.ts'
import { visibleItems, type TreeItem } from './treeModel.ts'

/**
 * The tree with Recent and the folder closed or open. The visible rows, in order, are:
 * recent, recent:d1, recent:d2, recent:d3 (when Recent is open), folder:f1, document:d1, document:d3 (when it is open),
 * document:d2.
 */
function walk(key: string, openKeys: readonly string[], pressed: string): TreeAction | null {
  const isExpanded = (candidate: string) => openKeys.includes(candidate)
  const items = visibleItems(sampleTree(), isExpanded)
  const current = items.find((item) => item.key === key)
  if (current === undefined) throw new Error(`No row ${key}`)
  return actionForKey(pressed, { items, current, isExpanded })
}

const focus = (key: string): TreeAction => ({ type: 'focus', key })

describe('the keys of the tree', () => {
  // One row per key and kind of row: the table of `actionForKey`.
  it.each([
    {
      name: 'Down moves to the next row',
      at: 'recent:d1',
      open: ['recent'],
      key: 'ArrowDown',
      action: focus('recent:d2'),
    },
    {
      name: 'Down on an open branch goes to its first child',
      at: 'recent',
      open: ['recent'],
      key: 'ArrowDown',
      action: focus('recent:d1'),
    },
    { name: 'Down on the last row stays', at: 'document:d2', open: [], key: 'ArrowDown', action: null },
    {
      name: 'Up moves to the previous row',
      at: 'recent:d2',
      open: ['recent'],
      key: 'ArrowUp',
      action: focus('recent:d1'),
    },
    { name: 'Up on the first row stays', at: 'recent', open: [], key: 'ArrowUp', action: null },
    { name: 'Home goes to the first row', at: 'document:d2', open: [], key: 'Home', action: focus('recent') },
    { name: 'End goes to the last visible row', at: 'recent', open: [], key: 'End', action: focus('document:d2') },
    { name: 'Home on the first row stays', at: 'recent', open: [], key: 'Home', action: null },
    {
      name: 'Right opens a closed branch',
      at: 'folder:f1',
      open: [],
      key: 'ArrowRight',
      action: { type: 'expand', key: 'folder:f1' },
    },
    {
      name: 'Right on an open branch goes to its first child',
      at: 'folder:f1',
      open: ['folder:f1'],
      key: 'ArrowRight',
      action: focus('document:d1'),
    },
    { name: 'Right on a document does nothing', at: 'document:d2', open: [], key: 'ArrowRight', action: null },
    {
      name: 'Left closes an open branch',
      at: 'folder:f1',
      open: ['folder:f1'],
      key: 'ArrowLeft',
      action: { type: 'collapse', key: 'folder:f1' },
    },
    {
      name: 'Left on a document goes to its folder',
      at: 'document:d1',
      open: ['folder:f1'],
      key: 'ArrowLeft',
      action: focus('folder:f1'),
    },
    {
      name: 'Left on a closed branch with no parent does nothing',
      at: 'folder:f1',
      open: [],
      key: 'ArrowLeft',
      action: null,
    },
    {
      name: 'Enter opens the document',
      at: 'document:d2',
      open: [],
      key: 'Enter',
      action: { type: 'activate', key: 'document:d2' },
    },
    {
      name: 'Space opens the document too',
      at: 'document:d2',
      open: [],
      key: ' ',
      action: { type: 'activate', key: 'document:d2' },
    },
    {
      name: 'Enter opens a closed folder',
      at: 'folder:f1',
      open: [],
      key: 'Enter',
      action: { type: 'expand', key: 'folder:f1' },
    },
    {
      name: 'Enter closes an open folder',
      at: 'folder:f1',
      open: ['folder:f1'],
      key: 'Enter',
      action: { type: 'collapse', key: 'folder:f1' },
    },
    { name: 'a letter is not an action: type-ahead has it', at: 'document:d2', open: [], key: 'a', action: null },
  ])('$name', ({ at, open, key, action }) => {
    expect(walk(at, open, key)).toEqual(action)
  })
})

describe('type-ahead', () => {
  const items = visibleItems(sampleTree(), () => true)
  const at = (key: string): TreeItem => {
    const item = items.find((candidate) => candidate.key === key)
    if (item === undefined) throw new Error(`No row ${key}`)
    return item
  }

  it('goes to the next row that starts with the letter, whatever its case', () => {
    expect(typeaheadTarget(items, at('recent'), 'w', 'en')?.key).toBe('recent:d2')
    expect(typeaheadTarget(items, at('recent'), 'W', 'en')?.key).toBe('recent:d2')
  })

  it('keeps going to the next row with the same letter when it is typed again', () => {
    // "Launch plan" appears in Recent and in the folder, and "Brand voice" twice too: `l` cycles through the launch rows.
    expect(typeaheadTarget(items, at('recent:d1'), 'l', 'en')?.key).toBe('document:d1')
    expect(typeaheadTarget(items, at('document:d1'), 'll', 'en')?.key).toBe('recent:d1')
  })

  it('matches the whole word typed, and stays where it is when that row matches', () => {
    expect(typeaheadTarget(items, at('recent:d3'), 'bra', 'en')?.key).toBe('recent:d3')
  })

  it('wraps to the top after the last row', () => {
    expect(typeaheadTarget(items, at('document:d2'), 'r', 'en')?.key).toBe('recent')
  })

  it('finds nothing when no row starts with what was typed', () => {
    expect(typeaheadTarget(items, at('recent'), 'zz', 'en')).toBeUndefined()
  })
})
