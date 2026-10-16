import * as Y from 'yjs'

// Content the schema does not allow, written into Yjs as a hand-made client could, one way in each. Every block carries the
// text FORBIDDEN, so a test can look for it in a state without reading the state through the schema, which would refuse it.

export const marker = 'FORBIDDEN'

type Build = (doc: Y.Doc) => void

const fragmentOf = (doc: Y.Doc) => doc.getXmlFragment('default')

/**
 * Yjs types an XML attribute as a string, and the wire carries any JSON value: an editor stores the level of a heading as
 * a number. A client that writes a number the schema does not allow is the case here, so the type has to be stepped over.
 */
const withAttribute = (element: Y.XmlElement, name: string, value: number): Y.XmlElement => {
  element.setAttribute(name, value as unknown as string)
  return element
}

const paragraphWith = (text: string): Y.XmlElement => {
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(text)])
  return paragraph
}

export const forbiddenContent: readonly (readonly [description: string, build: Build])[] = [
  [
    'a heading of level 1',
    (doc) => {
      const heading = withAttribute(new Y.XmlElement('heading'), 'level', 1)
      heading.insert(0, [new Y.XmlText(marker)])
      fragmentOf(doc).push([heading])
    },
  ],
  [
    'a heading of level 4',
    (doc) => {
      const heading = withAttribute(new Y.XmlElement('heading'), 'level', 4)
      heading.insert(0, [new Y.XmlText(marker)])
      fragmentOf(doc).push([heading])
    },
  ],
  [
    'a node the schema has none of',
    (doc) => {
      const quote = new Y.XmlElement('blockquote')
      quote.insert(0, [paragraphWith(marker)])
      fragmentOf(doc).push([quote])
    },
  ],
  [
    'a mark the schema has none of',
    (doc) => {
      const paragraph = new Y.XmlElement('paragraph')
      const text = new Y.XmlText(marker)
      paragraph.insert(0, [text])
      fragmentOf(doc).push([paragraph])
      text.format(0, marker.length, { strike: true })
    },
  ],
  [
    'a link to an address that runs a script',
    (doc) => {
      const paragraph = new Y.XmlElement('paragraph')
      const text = new Y.XmlText(marker)
      paragraph.insert(0, [text])
      fragmentOf(doc).push([paragraph])
      text.format(0, marker.length, { link: { href: 'javascript:alert(1)' } })
    },
  ],
  ['text straight in the document', (doc) => fragmentOf(doc).push([new Y.XmlText(marker)])],
  [
    'a paragraph inside a paragraph',
    (doc) => {
      const outer = new Y.XmlElement('paragraph')
      outer.insert(0, [paragraphWith(marker)])
      fragmentOf(doc).push([outer])
    },
  ],
  [
    'a numbered list that starts at a number nobody types',
    (doc) => {
      const list = withAttribute(new Y.XmlElement('orderedList'), 'start', 1e20)
      const item = new Y.XmlElement('listItem')
      item.insert(0, [paragraphWith(marker)])
      list.insert(0, [item])
      fragmentOf(doc).push([list])
    },
  ],
]
