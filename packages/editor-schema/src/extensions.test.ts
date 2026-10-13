import { flattenExtensions, getSchema } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { editorExtensions, fragmentName, headingLevels } from './extensions.ts'

const schema = getSchema(editorExtensions())

describe('the schema of a document', () => {
  it('has the nodes and marks of the MVP and nothing else', () => {
    expect(Object.keys(schema.nodes).sort()).toEqual([
      'bulletList',
      'doc',
      'heading',
      'listItem',
      'orderedList',
      'paragraph',
      'text',
    ])
    expect(Object.keys(schema.marks).sort()).toEqual(['bold', 'code', 'italic', 'link'])
  })

  it.each(['blockquote', 'codeBlock', 'hardBreak', 'horizontalRule'])('has no %s node', (name) => {
    expect(schema.nodes[name]).toBeUndefined()
  })

  it.each(['strike', 'underline'])('has no %s mark', (name) => {
    expect(schema.marks[name]).toBeUndefined()
  })

  it('has headings of level 2 and 3', () => {
    expect(headingLevels).toEqual([2, 3])
  })

  it('adds only the behaviour of the cursors and the list keys besides the schema: no undo and no trailing node', () => {
    const behaviour = flattenExtensions(editorExtensions())
      .filter((extension) => extension.type === 'extension')
      .map((extension) => extension.name)

    expect(behaviour.sort()).toEqual([
      'dropCursor',
      'gapCursor',
      'listItemBranchingDeleteKeymap',
      'listKeymap',
      'starterKit',
    ])
  })

  describe('the link mark', () => {
    const linkMark = schema.marks.link
    if (linkMark === undefined) throw new Error('The schema has no link mark')
    const toDOM = linkMark.spec.toDOM
    if (toDOM === undefined) throw new Error('The link mark does not render')
    const render = (href: string) => {
      const [tag, attributes] = toDOM(linkMark.create({ href }), true) as [string, Record<string, string>]
      return { tag, attributes }
    }

    it('keeps only the address, and gives every link the same rel and target', () => {
      expect(Object.keys(linkMark.spec.attrs ?? {})).toEqual(['href'])
      const { tag, attributes } = render('https://example.com')
      expect(tag).toBe('a')
      expect(attributes).toMatchObject({ href: 'https://example.com', rel: 'noopener noreferrer', target: '_blank' })
      // A null attribute is left out when the DOM is built.
      expect(attributes.class ?? null).toBeNull()
    })

    it('renders an address that is not allowed as an empty one', () => {
      expect(render('javascript:alert(1)').attributes.href).toBe('')
    })
  })
})

describe('the fragment', () => {
  it('is called default', () => {
    expect(fragmentName).toBe('default')
  })
})
