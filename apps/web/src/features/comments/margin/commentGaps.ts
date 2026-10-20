import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/** The attribute that carries the room a block opens below it; the stylesheet of the text turns it into padding. */
export const commentGapAttribute = 'data-comment-gap'

const gapsKey = new PluginKey<DecorationSet>('comment-gaps')

/**
 * Opens room in the text, below the blocks it is told to, so that the comments of the margin stay level with the text they
 * are about when several of them are about the same place. It is drawn and never written: a node decoration is of the view,
 * which every person has their own of, so it touches neither the Yjs document nor the undo history.
 *
 * It is a plugin of its own and not part of the highlights: the highlights depend on being after the sync plugin, and this
 * depends on nothing.
 */
export const commentGaps = Extension.create({
  name: 'commentGaps',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: gapsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, previous, _oldState, state) {
            const gaps = transaction.getMeta(gapsKey) as ReadonlyMap<number, number> | undefined
            if (gaps === undefined) return previous.map(transaction.mapping, transaction.doc)
            const decorations: Decoration[] = []
            state.doc.forEach((block, offset, index) => {
              const gap = gaps.get(index)
              if (gap === undefined) return
              decorations.push(
                Decoration.node(offset, offset + block.nodeSize, {
                  [commentGapAttribute]: String(gap),
                  style: `--comment-gap: ${gap}px`,
                }),
              )
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
        props: { decorations: (state) => gapsKey.getState(state) },
      }),
    ]
  },
})

/** Opens these gaps in the text, by the index of the block each one is below, and closes the ones that are not here. */
export function setCommentGaps(editor: Editor, gaps: ReadonlyMap<number, number>): void {
  editor.view.dispatch(editor.state.tr.setMeta(gapsKey, gaps).setMeta('addToHistory', false))
}
