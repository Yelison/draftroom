// @vitest-environment jsdom
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { openHeadlessEditor } from './testing/headlessEditor.ts'
import { isInterleavingOf } from './testing/interleaving.ts'

// Two people in the same empty paragraph who type at the same moment end up with their words in one paragraph, one run
// after the other or one inside the other, because both write at the same point. What they must never get is a letter
// that was typed once and is there twice, or one that is gone: that is the content changing, not the order.

const danielText = 'Before then, the kit is the plan.'
const priyaText = 'Decision: we ship on Friday.'

function shareAnEmptyParagraph(daniel: Y.Doc, priya: Y.Doc) {
  const danielEditor = openHeadlessEditor(daniel)
  const priyaEditor = openHeadlessEditor(priya)
  // The new paragraph is made by Daniel pressing Enter in the empty document, as it is in the product.
  danielEditor.commands.enter()
  Y.applyUpdate(priya, Y.encodeStateAsUpdate(daniel))
  for (const editor of [danielEditor, priyaEditor]) editor.commands.setTextSelection(editor.state.doc.content.size - 1)
  return { danielEditor, priyaEditor }
}

describe('two people type their first letter at the same moment in an empty paragraph that is already shared', () => {
  // Neither has heard of the other when typing the first letter: that is the timing in which each used to create a text node.
  it.each([
    { name: 'Daniel has the lower client id', danielHasLowerId: true },
    { name: 'Priya has the lower client id', danielHasLowerId: false },
  ])('$name: every letter is there once and both see the same', ({ danielHasLowerId }) => {
    const daniel = new Y.Doc()
    const priya = new Y.Doc()
    // The order Yjs gives two clients is by their id, which is random: fixing it makes each case the same every time.
    daniel.clientID = danielHasLowerId ? 1 : 2
    priya.clientID = danielHasLowerId ? 2 : 1
    const { danielEditor, priyaEditor } = shareAnEmptyParagraph(daniel, priya)
    const exchange = () => {
      Y.applyUpdate(daniel, Y.encodeStateAsUpdate(priya))
      Y.applyUpdate(priya, Y.encodeStateAsUpdate(daniel))
    }

    // Each types one letter, then they hear of each other, and from then on a letter each between every exchange.
    danielEditor.commands.insertContent(danielText.slice(0, 1))
    priyaEditor.commands.insertContent(priyaText.slice(0, 1))
    exchange()
    for (let next = 1; next < Math.max(danielText.length, priyaText.length); next++) {
      danielEditor.commands.insertContent(danielText.slice(next, next + 1))
      priyaEditor.commands.insertContent(priyaText.slice(next, next + 1))
      exchange()
    }

    const [seenByDaniel, seenByPriya] = [danielEditor, priyaEditor].map((editor) =>
      editor.getText({ blockSeparator: '\n' }),
    )
    expect(seenByPriya).toBe(seenByDaniel)
    const lastParagraph = (seenByDaniel ?? '').split('\n').at(-1) ?? ''
    expect(isInterleavingOf(lastParagraph, danielText, priyaText)).toBe(true)
  })
})
