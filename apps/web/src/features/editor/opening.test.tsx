import { screen } from '@testing-library/react'
import * as Y from 'yjs'
import { describe, expect, it, vi } from 'vitest'
import { budget, launchPlan, people, renderEditor } from './testing/renderEditor.tsx'

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

/** Who opens the document, and the document they open: one that they edit and one that they can only read. */
const openers = [
  ['an editor', people.daniel, launchPlan.id],
  ['a viewer', people.daniel, budget.id],
] as const

describe('opening a document', () => {
  it.each(documents.flatMap(([name, fill]) => openers.map(([role, who, id]) => [name, role, fill, who, id] as const)))(
    'writes nothing to %s, as %s',
    async (_name, _role, fill, signedInAs, documentId) => {
      // The document is on the collaboration server before the editor exists, as if someone had written it there.
      let shared: Y.Doc | undefined
      renderEditor({
        signedInAs,
        documentId,
        content: (given) => {
          shared = given
          fill(given.getXmlFragment('default'))
        },
      })
      if (shared === undefined) throw new Error('The content was never given to the document')
      // Watched from before the editor exists: any update the server receives, in any root, and any change of what it holds.
      const updates = vi.fn()
      shared.on('update', updates)
      const roots = [...shared.share.keys()]
      const state = Y.encodeStateAsUpdate(shared)

      await screen.findByRole('textbox', { name: 'Document content' })
      await screen.findByText(/^Sync status: (Synced|Read-only)$/)
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(updates).not.toHaveBeenCalled()
      expect([...shared.share.keys()]).toEqual(roots)
      expect(Y.encodeStateAsUpdate(shared)).toEqual(state)
    },
  )
})
