import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { normalizedAttributes } from './attributes.ts'

/** A transaction that carries what another person (or the server) wrote into the shared document. */
const isRemote = (transaction: Transaction): boolean =>
  (transaction.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin === true

/**
 * Puts right the attributes of any node a change leaves with one the schema does not allow: a heading of level 1, a list
 * that starts at `1e20`. Whatever the way in (a paste whose clipboard slice names the wrapping nodes, a command, another
 * extension), the document a person's editor writes holds only what `yUpdateToJson` will accept, so the server can read it.
 *
 * Changes that arrive from elsewhere are left as they are: putting them right would write the same fix from every open
 * editor into the shared document. What the server receives is the server's to validate.
 */
export function contentGuard(): Plugin {
  return new Plugin({
    key: new PluginKey('contentGuard'),
    appendTransaction(transactions, _before, state) {
      if (!transactions.some((transaction) => transaction.docChanged && !isRemote(transaction))) return null
      const fixes = state.tr
      state.doc.descendants((node, position) => {
        const attrs = normalizedAttributes(node.type.name, node.attrs)
        if (attrs !== null) fixes.setNodeMarkup(position, undefined, attrs)
      })
      return fixes.docChanged ? fixes : null
    },
  })
}

/** The guard as an extension, so it is part of the list the client and the server import. */
export const ContentGuard = Extension.create({
  name: 'contentGuard',
  addProseMirrorPlugins() {
    return [contentGuard()]
  },
})
