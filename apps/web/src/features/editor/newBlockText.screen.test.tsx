import { fragmentName } from '@draftroom/editor-schema'
import { act } from '@testing-library/react'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { openEditor, ydocOf } from './testing/renderEditor.tsx'

const paragraphs = (document: Y.Doc) =>
  document
    .getXmlFragment(fragmentName)
    .toArray()
    .flatMap((node) => (node instanceof Y.XmlElement && node.nodeName === 'paragraph' ? [node] : []))

describe('the editor of a document, as the screen makes it', () => {
  it('gives the paragraphs made with Enter their text node in the shared document', async () => {
    const { editor } = await openEditor()
    const document = ydocOf(editor)

    act(() => {
      editor.commands.focus('end')
      editor.commands.enter()
    })

    const made = paragraphs(document)
    expect(made.length).toBeGreaterThan(0)
    for (const paragraph of made) expect(paragraph.toArray()).toEqual([expect.any(Y.XmlText)])
  })
})
