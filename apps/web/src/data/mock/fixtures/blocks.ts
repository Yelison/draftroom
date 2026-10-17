import type { JSONContent } from '@tiptap/core'

// The blocks the fixtures write their documents with: what a template, a stored version and the demo's own documents
// are made of. They build the JSON the server would hold; `jsonToYUpdate` turns it into Yjs, never this module.

export const text = (value: string, marks?: readonly string[]): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks === undefined ? {} : { marks: marks.map((type) => ({ type })) }),
})

export const paragraph = (...parts: (string | JSONContent)[]): JSONContent => ({
  type: 'paragraph',
  content: parts.map((part) => (typeof part === 'string' ? text(part) : part)),
})

export const heading = (level: 2 | 3, value: string): JSONContent => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
})

type Item = string | JSONContent | readonly (string | JSONContent)[]

const items = (type: 'bulletList' | 'orderedList', rows: Item[]): JSONContent => ({
  type,
  content: rows.map((row) => ({ type: 'listItem', content: [paragraph(...(Array.isArray(row) ? row : [row]))] })),
})

export const bulletList = (...rows: Item[]) => items('bulletList', rows)
export const orderedList = (...rows: Item[]) => items('orderedList', rows)
export const bold = (value: string) => text(value, ['bold'])
