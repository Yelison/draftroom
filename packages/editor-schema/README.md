# @draftroom/editor-schema

The document schema of Draftroom: the one list of Tiptap extensions that the client and the server both import, and the
conversion between ProseMirror JSON and a Yjs update that only the server uses.

A document is stored as a Yjs state, and every node and mark in it must exist in this schema, or the document cannot be
opened. That makes the schema a shared resource with a single owner: the list only grows, and a change goes through
whoever owns this package.

## The schema

| Kind  | Names                                                         |
| ----- | ------------------------------------------------------------- |
| Nodes | `doc`, `paragraph`, `text`, `heading`, `bulletList`, `orderedList`, `listItem` |
| Marks | `bold`, `italic`, `code`, `link`                              |

- **Headings** have levels 2 and 3 (`headingLevels`). The document's title is the page's level 1 and is not part of the
  Yjs document.
- **Links** keep only their `href`. `rel="noopener noreferrer"` and `target="_blank"` are added when a link is
  rendered, never stored, so a pasted `target` or `rel` cannot end up in a document. An address is allowed only if its
  protocol is `http:`, `https:` or `mailto:` (`isAllowedLinkHref`).
- The content lives in the Yjs fragment called `default` (`fragmentName`).

StarterKit brings extensions the product does not have; each is turned off by name in `extensions.ts`: `blockquote`,
`codeBlock`, `hardBreak`, `horizontalRule`, `strike`, `underline`, its own `link`, `trailingNode` and `undoRedo`. Undo
is the Collaboration extension's, which only reverts the person's own changes.

## Entry points

| Import                            | For                                                       |
| --------------------------------- | --------------------------------------------------------- |
| `@draftroom/editor-schema`        | `editorExtensions()`, `fragmentName`, `headingLevels`, `isAllowedLinkHref`. The client and the server. |
| `@draftroom/editor-schema/convert` | `jsonToYUpdate`, `yUpdateToJson`, `replaceFragmentContent`, `InvalidDocumentError`. The server only: a client never rebuilds a document from JSON, and a separate entry point keeps the conversion out of its bundle. |

## What the conversion does with content it does not accept

`jsonToYUpdate` throws `InvalidDocumentError` instead of dropping anything, because its callers write content the
product authored (templates, a restored version) and a silent loss would hide a mistake:

- a node or mark that is not in the schema;
- content that breaks a node's rules (text straight in the document, an empty document, a list with no items);
- a root that is not `doc`;
- a heading with a level other than 2 or 3, or with no level;
- a link whose address is not allowed (`javascript:`, `data:`, a relative address…).

Attributes the schema does not define are left out, so what is written is always the schema's own form.

`yUpdateToJson` applies the same rules to what it reads. A state with no content yet reads as one empty paragraph.

`replaceFragmentContent(fragment, json)` makes a live fragment hold the content, by comparing the two and changing only what
differs, so the nodes the content keeps keep their identity (an edit made to one of them meanwhile, and a comment anchored
in it, survive). It writes only the fragment, inside the transaction of its caller, and it checks the content as
`jsonToYUpdate` does before it writes anything. It is what restoring a version uses.
