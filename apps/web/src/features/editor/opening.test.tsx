import { screen } from '@testing-library/react'
import * as Y from 'yjs'
import { describe, expect, it, vi } from 'vitest'
import { budget, launchPlan, people, renderEditor } from './testing/renderEditor.tsx'

// The screen opens whatever Yjs document this module hands it, so a test can start from one that already has content and
// watch it from before the editor is made.
const given = vi.hoisted(() => ({ ydoc: null as Y.Doc | null }))
vi.mock('./useLocalYDoc.ts', () => ({ useLocalYDoc: () => given.ydoc }))

function element(name: string, ...children: (Y.XmlElement | Y.XmlText)[]) {
  const node = new Y.XmlElement(name)
  node.insert(0, children)
  return node
}
const paragraph = (words: string) => element('paragraph', new Y.XmlText(words))
const list = (name: 'bulletList' | 'orderedList', words: string) => element(name, element('listItem', paragraph(words)))

/** The content a document could be opened with, built straight in Yjs: some end in a node that is not a paragraph. */
const documents: [string, (fragment: Y.XmlFragment) => void][] = [
  ['an empty document', () => {}],
  ['a document that ends in a paragraph', (fragment) => fragment.insert(0, [paragraph('Hello')])],
  [
    'a document that ends in a bulleted list',
    (fragment) => fragment.insert(0, [paragraph('Hello'), list('bulletList', 'x')]),
  ],
  ['a document that ends in a numbered list', (fragment) => fragment.insert(0, [list('orderedList', 'x')])],
  ['a document that ends in a heading', (fragment) => fragment.insert(0, [element('heading', new Y.XmlText('Title'))])],
]

const people_ = [
  ['an editor', people.daniel, launchPlan.id],
  ['a viewer', people.daniel, budget.id],
] as const

describe('opening a document', () => {
  it.each(documents.flatMap(([name, fill]) => people_.map(([role, who, id]) => [name, fill, role, who, id] as const)))(
    'writes nothing to %s, as %s',
    async (_name, fill, _role, signedInAs, documentId) => {
      const ydoc = new Y.Doc()
      fill(ydoc.getXmlFragment('default'))
      given.ydoc = ydoc
      // Watched from before the editor exists: any update, in any root, and any change of what the document holds.
      const updates = vi.fn()
      ydoc.on('update', updates)
      const roots = [...ydoc.share.keys()]
      const state = Y.encodeStateAsUpdate(ydoc)

      renderEditor({ signedInAs, documentId })
      await screen.findByRole('textbox', { name: 'Document content' })
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(updates).not.toHaveBeenCalled()
      expect([...ydoc.share.keys()]).toEqual(roots)
      expect(Y.encodeStateAsUpdate(ydoc)).toEqual(state)
    },
  )
})
