import type { Extensions } from '@tiptap/core'
import { Link } from '@tiptap/extension-link'
import { StarterKit } from '@tiptap/starter-kit'
import { isAllowedLinkHref } from './links.ts'

/**
 * The name of the Yjs root fragment that holds a document's content, on the wire and in the database (protocol,
 * section 2). `@tiptap/y-tiptap` defaults to `prosemirror` and the Collaboration extension to `default`, so every call
 * that takes a name is given this one explicitly.
 */
export const fragmentName = 'default'

/**
 * The levels of heading a document has. The document's title is the page's level 1 and lives outside the Yjs document,
 * so the content starts at 2. Adding a level is a change to the schema: it goes through the owner of this package.
 */
export const headingLevels = [2, 3] as const

/**
 * The nodes and marks of a document, and nothing else. A document stored with a node this list does not know cannot be
 * read back, so the list only ever grows, and only through this package's owner.
 *
 * Nodes: `doc`, `paragraph`, `text`, `heading` (levels 2 and 3), `bulletList`, `orderedList`, `listItem`.
 * Marks: `bold`, `italic`, `code`, `link`.
 *
 * StarterKit also brings extensions the product does not have, each turned off here by name: `blockquote`, `codeBlock`,
 * `hardBreak`, `horizontalRule`, `strike`, `underline`, its own `link` (replaced below by one with stricter rules),
 * `trailingNode` (it writes an empty paragraph into every document it opens, even a read-only one, which would show up
 * as an update nobody typed) and `undoRedo` (undo is the one of the Collaboration extension, which only reverts the
 * person's own changes). What stays besides the schema is behaviour that adds no node or mark: the drop and gap
 * cursors and the list keymap.
 */
export function editorExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [...headingLevels] },
      blockquote: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
      strike: false,
      underline: false,
      link: false,
      trailingNode: false,
      undoRedo: false,
    }),
    safeLink,
  ]
}

/**
 * A link keeps only its address. Tiptap's own link also stores `target`, `rel`, `class` and `title` as attributes of
 * the mark, and fills them from whatever a pasted `<a>` carried, so a pasted `target="_top"` would be saved in the
 * document. Here those come from the options below, the same for every link, and are never stored.
 */
const safeLink = Link.extend({
  addAttributes() {
    return { href: { default: null } }
  },
}).configure({
  // Following a link while editing would take the person away from their text; a link in a read-only document is a
  // plain anchor, which the browser follows on its own with the `rel` below.
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: 'https',
  HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
  isAllowedUri: (href) => isAllowedLinkHref(href),
})
