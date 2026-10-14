import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import { AddMarkStep, AttrStep, RemoveMarkStep } from '@tiptap/pm/transform'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { normalizedAttributes } from './attributes.ts'
import { isAllowedLinkHref } from './links.ts'

/** A transaction that carries what another person (or the server) wrote into the shared document. */
const isRemote = (transaction: Transaction): boolean =>
  (transaction.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin === true

type Range = [from: number, to: number]

/**
 * Where the local changes of these transactions landed, in the document they leave. Each step adds the range it
 * changed and carries the ranges found so far through itself, so a range stays on what it marked whatever came after.
 * The steps of a remote transaction add nothing (that content is not this editor's to touch) but still move the others.
 * Steps that change an attribute or a mark move no position, so they name their range themselves.
 */
function localChanges(transactions: readonly Transaction[]): Range[] {
  let ranges: Range[] = []
  for (const transaction of transactions) {
    const local = !isRemote(transaction)
    for (const step of transaction.steps) {
      const map = step.getMap()
      ranges = ranges.map(([from, to]) => [map.map(from, -1), map.map(to, 1)])
      if (!local) continue
      map.forEach((_oldFrom, _oldTo, from, to) => ranges.push([from, to]))
      if (step instanceof AttrStep) ranges.push([step.pos, step.pos + 1])
      if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) ranges.push([step.from, step.to])
    }
  }
  return ranges
}

/**
 * Puts right what a local change leaves that `yUpdateToJson` would refuse: the attributes of a node the schema does not
 * allow (a heading of level 1, a list that starts at `1e20`) and a link whose address is not allowed. Whatever the way in
 * (a paste whose clipboard slice names the wrapping nodes, a command, another extension), the document a person's editor
 * writes holds only what the server can read.
 *
 * It looks only at what the change touched, so it never rewrites content that was already there (another person's
 * heading, which the server is to judge) and does not walk the whole document on every key. Changes that arrive from
 * elsewhere are left as they are: putting them right would write the same fix from every open editor into the shared
 * document.
 */
export function contentGuard(): Plugin {
  return new Plugin({
    key: new PluginKey('contentGuard'),
    appendTransaction(transactions, _before, state) {
      const ranges = localChanges(transactions)
      if (ranges.length === 0) return null
      const fixes = state.tr
      const seen = new Set<number>()
      for (const [from, to] of ranges) {
        const end = Math.min(to, state.doc.content.size)
        state.doc.nodesBetween(Math.min(from, end), end, (node, position) => {
          if (seen.has(position)) return
          seen.add(position)
          const attrs = normalizedAttributes(node.type.name, node.attrs)
          if (attrs !== null) fixes.setNodeMarkup(position, undefined, attrs)
          for (const mark of node.marks) {
            if (mark.type.name === 'link' && !isAllowedLinkHref(mark.attrs.href)) {
              fixes.removeMark(position, position + node.nodeSize, mark)
            }
          }
        })
      }
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
