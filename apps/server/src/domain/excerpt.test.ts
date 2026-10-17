import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { excerptLimit, excerptOf } from './excerpt.ts'

const paragraph = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const text = (value: string): JSONContent => ({ type: 'text', text: value })
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })

describe('the excerpt of a document', () => {
  it.each([
    ['the text of the first paragraph', doc(paragraph(text('Hello'))), 'Hello'],
    [
      'the first paragraph with text, after a heading',
      doc({ type: 'heading', content: [text('Title')] }, paragraph(text('Body'))),
      'Body',
    ],
    [
      'the first paragraph that is not blank',
      doc(paragraph(), paragraph(text('   ')), paragraph(text('Third'))),
      'Third',
    ],
    [
      'a paragraph inside a list item',
      doc({ type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('In a list'))] }] }),
      'In a list',
    ],
    [
      'marks left out, the text kept',
      doc(paragraph(text('Some '), { ...text('bold'), marks: [{ type: 'bold' }] })),
      'Some bold',
    ],
    ['a line break as a space', doc(paragraph(text('one'), { type: 'hardBreak' }, text('two'))), 'one two'],
    ['runs of white space as one', doc(paragraph(text('  too \n  much   space '))), 'too much space'],
  ])('is %s', (_name, content, expected) => {
    expect(excerptOf(content)).toBe(expected)
  })

  it.each([
    ['an empty paragraph', doc(paragraph())],
    ['only white space', doc(paragraph(text(' \n ')))],
    ['no paragraph at all', doc({ type: 'heading', content: [text('Only a heading')] })],
    ['a document with no content', { type: 'doc' }],
  ])('is null for %s', (_name, content) => {
    expect(excerptOf(content)).toBeNull()
  })
})

describe('the length of an excerpt', () => {
  const longer = (head: string, tail: string) => excerptOf(doc(paragraph(text(head + tail))))

  it.each([
    ['one short of the limit', 'a'.repeat(excerptLimit - 1), 'a'.repeat(excerptLimit - 1)],
    ['exactly the limit', 'a'.repeat(excerptLimit), 'a'.repeat(excerptLimit)],
    ['one over the limit', 'a'.repeat(excerptLimit + 1), 'a'.repeat(excerptLimit)],
  ])('keeps %s', (_name, input, expected) => {
    expect(longer(input, '')).toBe(expected)
  })

  it('counts code points: an emoji that takes two UTF-16 units is one character, and is never cut in half', () => {
    const excerpt = longer('a'.repeat(excerptLimit - 1), '😀 and more')
    expect(excerpt).toBe(`${'a'.repeat(excerptLimit - 1)}😀`)
    expect(Array.from(excerpt ?? '')).toHaveLength(excerptLimit)
  })

  it('fits the limit of the column when it is all emoji', () => {
    const excerpt = longer('😀'.repeat(excerptLimit + 5), '')
    expect(Array.from(excerpt ?? '')).toHaveLength(excerptLimit)
  })

  it('does not end in the space it was cut at', () => {
    expect(longer('a'.repeat(excerptLimit - 1), ' tail')).toBe('a'.repeat(excerptLimit - 1))
  })
})
