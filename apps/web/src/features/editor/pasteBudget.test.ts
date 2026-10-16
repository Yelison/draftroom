import { MAX_UNSENT_BYTES } from '@draftroom/contract/collab'
import { editorExtensions } from '@draftroom/editor-schema'
import { getSchema } from '@tiptap/core'
import { DOMParser, type Slice } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import { updateBytesOf } from './pasteBudget.ts'

const schema = getSchema(editorExtensions())

function sliceOf(html: string): Slice {
  const container = document.createElement('div')
  container.innerHTML = html
  return DOMParser.fromSchema(schema).parseSlice(container)
}

const items = (count: number) => `<ul>${'<li>a</li>'.repeat(count)}</ul>`

describe('the size of what a paste would add', () => {
  it('is the bytes of the Yjs update, which a list of 35 000 short items makes large though its text is small', () => {
    const slice = sliceOf(items(35_000))

    const text = slice.content.textBetween(0, slice.content.size, ' ').length
    const bytes = updateBytesOf(slice, schema)

    expect(text).toBeLessThan(MAX_UNSENT_BYTES / 10)
    expect(bytes).toBeGreaterThan(MAX_UNSENT_BYTES)
  }, 60_000)

  it('grows with the number of nodes, not with the characters', () => {
    const fewLongWords = sliceOf(`<p>${'word '.repeat(4000)}</p>`)
    const manyShortItems = sliceOf(items(4000))

    expect(updateBytesOf(manyShortItems, schema)).toBeGreaterThan(updateBytesOf(fewLongWords, schema))
  })

  it('is small for a sentence', () => {
    expect(updateBytesOf(sliceOf('<p>Hello world</p>'), schema)).toBeLessThan(200)
  })
})
