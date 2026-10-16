import { describe, expect, it } from 'vitest'
import { emptyDocumentState, metadataChanges } from './documents.ts'

const current = { title: 'Autumn launch plan', folderId: 'a3d5c7e9-1b2f-4a6c-8d0e-3f5a7c9e1b33' }

describe('what a metadata patch changes', () => {
  it.each([
    ['a new title', { title: 'Autumn launch plan v2' }, ['document.renamed']],
    ['another folder', { folderId: 'b4e6d8fa-2c3a-4b7d-9e1f-4a6c8e0b2d55' }, ['document.moved']],
    ['no folder', { folderId: null }, ['document.moved']],
    ['both', { title: 'Plan', folderId: null }, ['document.renamed', 'document.moved']],
    ['the current title', { title: current.title }, []],
    ['the current folder', { folderId: current.folderId }, []],
    ['nothing', {}, []],
  ])('is %s', (_name, patch, expected) => {
    expect(metadataChanges(current, patch)).toEqual(expected)
  })

  it('reads a document with no folder as moved only when the patch names one', () => {
    expect(metadataChanges({ ...current, folderId: null }, { folderId: null })).toEqual([])
    expect(metadataChanges({ ...current, folderId: null }, { folderId: current.folderId })).toEqual(['document.moved'])
  })
})

describe('the state of a new document', () => {
  it('is an update with no structs and an empty delete set', () => {
    expect([...emptyDocumentState]).toEqual([0, 0])
  })
})
