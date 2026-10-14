import { describe, expect, it } from 'vitest'
import { document, folder, sampleTree } from './sampleTree.ts'
import { buildTree, recentLimit, visibleItems, type TreeItem } from './treeModel.ts'

const keys = (items: readonly TreeItem[]) => items.map((item) => item.key)
const open = () => true
const closed = () => false

describe('the tree of the explorer', () => {
  it('lists Recent first, then the folders with their documents, then the documents that are in none', () => {
    const roots = sampleTree()

    expect(keys(visibleItems(roots, open))).toEqual([
      'recent',
      'recent:d1',
      'recent:d2',
      'recent:d3',
      'folder:f1',
      'document:d1',
      'document:d3',
      'document:d2',
    ])
  })

  it('gives the same document a key in each place it appears, so no two rows share one', () => {
    const all = keys(visibleItems(sampleTree(), open))

    expect(new Set(all).size).toBe(all.length)
  })

  it('shows only the most recent documents in Recent, in the order the server gave them', () => {
    const documents = Array.from({ length: recentLimit + 3 }, (_, index) => document(`d${index}`, `Document ${index}`))

    const [recent] = buildTree({ folders: [], documents, searching: false, recentLabel: 'Recent' })

    expect(recent?.kind === 'recent' && recent.children.map((item) => item.document.id)).toEqual(
      documents.slice(0, recentLimit).map((item) => item.id),
    )
  })

  it('has no Recent group when there is no document', () => {
    const roots = buildTree({
      folders: [folder('f1', 'Product')],
      documents: [],
      searching: false,
      recentLabel: 'Recent',
    })

    expect(keys(roots)).toEqual(['folder:f1'])
  })

  it('lists a document whose folder is not loaded with the loose ones instead of dropping it', () => {
    const roots = buildTree({
      folders: [],
      documents: [document('d1', 'Orphan', 'missing-folder')],
      searching: false,
      recentLabel: 'Recent',
    })

    expect(keys(roots)).toEqual(['recent', 'document:d1'])
  })

  it('lists the hits of a search flat, with no Recent and no folders around them', () => {
    const roots = buildTree({
      folders: [folder('f1', 'Product')],
      documents: [document('d1', 'Launch plan', 'f1'), document('d2', 'Launch notes')],
      searching: true,
      recentLabel: 'Recent',
    })

    expect(keys(roots)).toEqual(['document:d1', 'document:d2'])
    expect(roots.map((item) => item.level)).toEqual([1, 1])
  })

  it('hides the children of a branch that is closed', () => {
    expect(keys(visibleItems(sampleTree(), closed))).toEqual(['recent', 'folder:f1', 'document:d2'])
  })

  it('counts the levels from 1, so a screen reader says how deep a row is', () => {
    const levels = Object.fromEntries(visibleItems(sampleTree(), open).map((item) => [item.key, item.level]))

    expect(levels).toMatchObject({ recent: 1, 'recent:d1': 2, 'folder:f1': 1, 'document:d1': 2, 'document:d2': 1 })
  })
})
