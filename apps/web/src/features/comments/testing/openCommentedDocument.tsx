import { toBase64 } from '../../../collab/base64.ts'
// The test plays the server, which is what writes the starting content of a document from JSON; the client never does.
// oxlint-disable-next-line no-restricted-imports
import { jsonToYUpdate } from '@draftroom/editor-schema/convert'
import { screen } from '@testing-library/react'
import * as Y from 'yjs'
import { people, renderEditor, launchPlan, type RenderEditorOptions } from '../../editor/testing/renderEditor.tsx'
import type { DataSource } from '../../../data/DataSource.ts'
import type { MockServer } from '../../../data/mock/createMockDataSource.ts'

/** A thread someone has already started: the text it is about, and what was said. */
export interface StartedThread {
  quote: string
  body: string
  /** Who wrote it; Marta, who owns the launch plan, unless said. */
  by?: string
}

/** The anchor of `quote` in the text of a document, made the way a client does it: the start with `assoc` 0, the end with -1. */
export function anchorOnText(shared: Y.Doc, quote: string) {
  const find = (node: Y.XmlFragment | Y.XmlElement): Y.XmlText | null => {
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlText && child.toString().includes(quote)) return child
      if (child instanceof Y.XmlElement) {
        const inside = find(child)
        if (inside !== null) return inside
      }
    }
    return null
  }
  const text = find(shared.getXmlFragment('default'))
  if (text === null) throw new Error(`"${quote}" is not in the document`)
  const index = text.toString().indexOf(quote)
  const encode = (position: Y.RelativePosition) => toBase64(Y.encodeRelativePosition(position))
  return {
    start: encode(Y.createRelativePositionFromTypeIndex(text, index, 0)),
    end: encode(Y.createRelativePositionFromTypeIndex(text, index + [...quote].length, -1)),
  }
}

export interface OpenCommentedOptions extends Omit<RenderEditorOptions, 'content' | 'before'> {
  /** What the document says, a paragraph for each. */
  paragraphs?: string[]
  /** Threads started on that text before the screen opens, on top of the ones the fixtures have. */
  started?: StartedThread[]
  /** Whether the threads the fixtures give the launch plan are listed too; they are unless this is `false`. */
  fixtureThreads?: boolean
}

/**
 * The launch plan as the screen opens it, with text in it and threads anchored on that text: the people who wrote them
 * and the server are the mock's, so what they wrote is what the panel lists.
 */
export function renderCommentedDocument({
  paragraphs = [],
  started = [],
  fixtureThreads = true,
  wrap,
  ...options
}: OpenCommentedOptions = {}) {
  let server: MockServer | undefined
  const view = renderEditor({
    ...options,
    wrap: (dataSource) => {
      const own: DataSource = fixtureThreads
        ? dataSource
        : {
            ...dataSource,
            listThreads: async (request) => ({
              items: (await dataSource.listThreads(request)).items.filter((thread) =>
                started.some(({ quote }) => quote === thread.quote),
              ),
            }),
          }
      return wrap?.(own) ?? own
    },
    before: (created) => {
      server = created
    },
    content: (shared) => {
      if (paragraphs.length > 0) {
        const doc = {
          type: 'doc',
          content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
        }
        Y.applyUpdate(shared, jsonToYUpdate(doc))
      }
      for (const { quote, body, by = people.marta } of started) {
        void server?.connect({ signedInAs: by }).createThread({
          params: { path: { documentId: launchPlan.id } },
          body: { anchor: anchorOnText(shared, quote), quote, body },
        })
      }
    },
  })
  return view
}

/** The panel beside the text. */
export const findPanel = () =>
  screen.findByRole('complementary', { name: /Comments and activity|Comentarios y actividad/ })
