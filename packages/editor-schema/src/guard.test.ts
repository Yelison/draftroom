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
})
