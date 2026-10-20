import { anchorOnText } from '../../../data/mock/collab/seededContent.ts'
// The test plays the server, which is what writes the starting content of a document from JSON; the client never does.
// oxlint-disable-next-line no-restricted-imports
import { jsonToYUpdate } from '@draftroom/editor-schema/convert'
import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { expect } from 'vitest'
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

/** The margin beside the text, where the threads are. */
export const findMargin = () =>
  screen.findByRole('complementary', { name: /Comments in the margin|Comentarios al margen/ })

/** The element of a thread that says `text`: its compact card until it is the active one, its whole card after. */
export const threadOf = (margin: HTMLElement, text: string) =>
  within(margin).getByText(text, { exact: false }).closest<HTMLElement>('[data-thread-id]') as HTMLElement

/** Makes the thread that says `text` the active one, as a person does by choosing its compact card, and gives its card. */
export async function openThread(user: UserEvent, margin: HTMLElement, text: string): Promise<HTMLElement> {
  const thread = threadOf(margin, text)
  if (thread.tagName !== 'ARTICLE') await user.click(thread)
  await waitFor(() => expect(threadOf(margin, text).tagName).toBe('ARTICLE'))
  return threadOf(margin, text)
}
