import { describe, expect, it } from 'vitest'
import { isAllowedSliceContext } from './slice.ts'

const slice = (context: unknown, open = '0 0') => `${open} ${JSON.stringify(context)}`

describe('isAllowedSliceContext', () => {
  const accepted = [
    ['no wrapping nodes', slice([])],
    ['a heading of level 2', slice(['heading', { level: 2 }])],
    ['a heading of level 3', slice(['heading', { level: 3 }])],
    ['a bulleted list and its item', slice(['bulletList', null, 'listItem', null], '2 2')],
    ['a numbered list that starts at 3', slice(['orderedList', { start: 3, type: null }, 'listItem', null], '2 2')],
    ['a paragraph', slice(['paragraph', null])],
    ['the three numbers of a slice with a closed end', slice(['paragraph', null], '1 1 -1')],
  ] as const

  const refused = [
    ['a heading of level 1', slice(['heading', { level: 1 }])],
    ['a heading of level 7', slice(['heading', { level: 7 }])],
    ['text for a heading level', slice(['heading', { level: 'x onclick=1' }])],
    ['a heading with no level', slice(['heading', {}])],
    ['a node the schema does not have', slice(['blockquote', null])],
    ['a code block', slice(['codeBlock', null])],
    ['the text node', slice(['text', null])],
    ['the document node', slice(['doc', null])],
    ['an attribute the node does not have', slice(['paragraph', { onclick: 'x' }])],
    ['a numbered list that starts at 1e20', slice(['orderedList', { start: 1e20, type: null }])],
    ['a context that is not an array', slice({ heading: 1 })],
    ['a context with an odd number of entries', slice(['paragraph'])],
    ['a name that is not text', slice([1, null])],
    ['attributes that are not an object', slice(['paragraph', 'x'])],
    ['attributes that are an array', slice(['paragraph', []])],
    ['something that is not JSON', '0 0 [heading'],
    ['no numbers before the context', '[]'],
    ['an empty attribute', ''],
    ['a node named after a property of Object', slice(['constructor', null])],
  ] as const

  it.each(accepted)('accepts %s', (_name, attribute) => {
    expect(isAllowedSliceContext(attribute)).toBe(true)
  })

  it.each(refused)('refuses %s', (_name, attribute) => {
    expect(isAllowedSliceContext(attribute)).toBe(false)
  })
})
