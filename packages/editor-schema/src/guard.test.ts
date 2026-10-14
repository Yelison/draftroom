import { getSchema } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { describe, expect, it } from 'vitest'
import { editorExtensions } from './extensions.ts'
import { contentGuard } from './guard.ts'

const schema = getSchema(editorExtensions())

/** A node by type name. ProseMirror builds it with the attributes it is given, which is the way in the guard watches. */
function make(type: string, attrs: Record<string, unknown> | null, ...content: Node[]): Node {
  const nodeType = schema.nodes[type]
  if (nodeType === undefined) throw new Error(`The schema has no ${type}`)
  return nodeType.create(attrs, content)
}

const word = () => schema.text('Hello')
const paragraph = () => make('paragraph', null, word())
const start = (...blocks: Node[]) =>
  EditorState.create({
    schema,
    plugins: [contentGuard()],
    doc: make('doc', null, ...(blocks.length > 0 ? blocks : [make('paragraph', null)])),
  })

/** The type and attributes of the nodes that have rules. */
function ruledNodes(state: EditorState) {
  const found: [string, unknown][] = []
  state.doc.descendants((node) => {
    if (node.type.name === 'heading' || node.type.name === 'orderedList') found.push([node.type.name, node.attrs])
  })
  return found
}

describe('the content guard', () => {
  it.each([
    ['1', 1, 2],
    ['7', 7, 3],
    ['"x onclick=1"', 'x onclick=1', 2],
  ])('puts a heading of level %s right when it is inserted', (_name, level, expected) => {
    const state = start()

    const next = state.apply(state.tr.insert(0, make('heading', { level }, word())))

    expect(ruledNodes(next)).toEqual([['heading', { level: expected }]])
  })

  it('puts a heading right when a paragraph becomes one without a level', () => {
    const state = start(paragraph())

    const next = state.apply(
      state.tr.setBlockType(
        0,
        1,
        schema.nodes.heading ??
          (() => {
            throw new Error('no heading')
          })(),
      ),
    )

    expect(ruledNodes(next)).toEqual([['heading', { level: 2 }]])
  })

  it('puts the start and the style of a numbered list right', () => {
    const state = start()
    const item = make('listItem', null, paragraph())

    const next = state.apply(state.tr.insert(0, make('orderedList', { start: 1e20, type: 'x' }, item)))

    expect(ruledNodes(next)).toEqual([['orderedList', { start: 1, type: null }]])
  })

  it('leaves what is right as it is', () => {
    const state = start()

    const next = state.apply(state.tr.insert(0, make('heading', { level: 2 }, word())))

    expect(ruledNodes(next)).toEqual([['heading', { level: 2 }]])
  })

  it('leaves a change that came from the shared document alone: the server is the one that checks those', () => {
    const state = start()
    const change = state.tr
      .insert(0, make('heading', { level: 1 }, word()))
      .setMeta(ySyncPluginKey, { isChangeOrigin: true })

    const next = state.apply(change)

    expect(ruledNodes(next)).toEqual([['heading', { level: 1 }]])
  })

  describe('what it looks at', () => {
    const level = (state: EditorState, index: number) => state.doc.child(index).attrs.level

    it('leaves a heading that is already there alone when the person types somewhere else', () => {
      const bad = make('heading', { level: 1 }, word())
      const state = start(bad, paragraph())
      const at = state.doc.child(0).nodeSize + 1

      const next = state.apply(state.tr.insertText('x', at))

      expect(level(next, 0)).toBe(1)
    })

    it('leaves what another person wrote alone, then the person typing in another paragraph', () => {
      const state = start(paragraph())
      const remote = state.apply(
        state.tr.insert(0, make('heading', { level: 1 }, word())).setMeta(ySyncPluginKey, { isChangeOrigin: true }),
      )
      const at = remote.doc.child(0).nodeSize + 1

      const next = remote.apply(remote.tr.insertText('x', at))

      expect(level(next, 0)).toBe(1)
    })

    it('still finds a bad heading when a later step of the same transaction moved it', () => {
      const state = start(paragraph())

      const change = state.tr
        .insert(state.doc.content.size, make('heading', { level: 7 }, word()))
        .insert(0, paragraph())
        .insert(0, paragraph())
      const next = state.apply(change)

      expect(ruledNodes(next)).toEqual([['heading', { level: 3 }]])
    })

    it('puts right a level changed in place, which moves no position', () => {
      const state = start(make('heading', { level: 2 }, word()))

      const next = state.apply(state.tr.setNodeAttribute(0, 'level', 1))

      expect(level(next, 0)).toBe(2)
    })
  })

  describe('links', () => {
    const marked = (href: string) => schema.text('click', [schema.marks.link!.create({ href })])
    const marksOf = (state: EditorState) => {
      const found: unknown[] = []
      state.doc.descendants((node) => void node.marks.forEach((mark) => found.push([mark.type.name, mark.attrs.href])))
      return found
    }

    it.each(['javascript:alert(1)', 'data:text/html,x', '/relative', ''])(
      'removes a link to %j that is inserted',
      (href) => {
        const state = start()

        const next = state.apply(state.tr.insert(1, marked(href)))

        expect(marksOf(next)).toEqual([])
        expect(next.doc.textContent).toBe('click')
      },
    )

    it('removes a link that is put on text already there', () => {
      const state = start(paragraph())

      const next = state.apply(state.tr.addMark(1, 6, schema.marks.link!.create({ href: 'javascript:alert(1)' })))

      expect(marksOf(next)).toEqual([])
      expect(next.doc.textContent).toBe('Hello')
    })

    it('keeps a link to an address that is allowed', () => {
      const state = start()

      const next = state.apply(state.tr.insert(1, marked('https://example.com')))

      expect(marksOf(next)).toEqual([['link', 'https://example.com']])
    })

    it('leaves a link that another person wrote alone', () => {
      const state = start()
      const change = state.tr.insert(1, marked('javascript:alert(1)')).setMeta(ySyncPluginKey, { isChangeOrigin: true })

      const next = state.apply(change)

      expect(marksOf(next)).toEqual([['link', 'javascript:alert(1)']])
    })
  })
})
