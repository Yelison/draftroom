import { anchorSchema, documentName } from '@draftroom/contract/collab'
import { editorExtensions, fragmentName } from '@draftroom/editor-schema'
import { Editor } from '@tiptap/core'
import { Collaboration } from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { boundDocumentOf, resolveAnchor } from '../../../features/comments/anchors.ts'
import '../../../features/editor/testing/jsdomShims.ts'
import { demoContent } from '../fixtures/demoContent.ts'
import { designReview, launchPlan } from '../fixtures/documents.ts'
import { marta } from '../fixtures/index.ts'
import { seedId } from '../ids.ts'
import { createMockServer } from '../createMockDataSource.ts'
import { fakePage } from './fakePage.ts'
import { seedContent } from './seededContent.ts'

const locales = ['en', 'es'] as const

/** What a thread of the demo covers in the text of its document once the document is open, or `null` if it covers nothing. */
async function coveredBy(locale: (typeof locales)[number], documentId: string, threadId: string) {
  const server = createMockServer({ demo: { locale, transport: null, scripts: [], page: fakePage().page } })
  const rest = server.connect({ signedInAs: marta.email })
  const { items } = await rest.listThreads({ params: { path: { documentId } } })
  const thread = items.find((row) => row.id === threadId)
  if (thread === undefined) throw new Error(`The demo has no thread ${threadId} on ${documentId}`)

  // What a person who opens the document is given: the live document of the simulated server, as the demo starts it.
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(server.collaboration.document(documentName(documentId))))
  const editor = new Editor({
    extensions: [...editorExtensions(), Collaboration.configure({ document: ydoc, field: fragmentName })],
  })
  try {
    const bound = boundDocumentOf(editor.state)
    if (bound === null) throw new Error('The editor is not bound to the document')
    const range = resolveAnchor(bound, thread.anchor)
    return {
      thread,
      text: range === null ? null : editor.state.doc.textBetween(range.from, range.to, ' '),
    }
  } finally {
    editor.destroy()
    ydoc.destroy()
  }
}

describe.each(locales)('the comments of the demo in %s', (locale) => {
  const threads = [
    { what: 'an open thread', documentId: launchPlan.id, threadId: seedId(5, 1) },
    { what: 'a resolved thread', documentId: launchPlan.id, threadId: seedId(5, 2) },
    { what: 'a thread of another document', documentId: designReview.id, threadId: seedId(5, 3) },
  ]

  it.each(threads)('anchor $what on the sentence it quotes', async ({ documentId, threadId }) => {
    const { thread, text } = await coveredBy(locale, documentId, threadId)

    expect(text).toBe(thread.quote)
  })

  it('leave a thread whose text was taken out orphaned, with its quote', async () => {
    const { thread, text } = await coveredBy(locale, launchPlan.id, seedId(5, 4))

    expect(text).toBeNull()
    expect(thread.status).toBe('open')
    expect(thread.quote.length).toBeGreaterThan(0)
  })

  it('are on a document that does not show the text that was taken out', () => {
    const server = createMockServer({ demo: { locale, transport: null, scripts: [], page: fakePage().page } })
    const live = server.collaboration.document(documentName(launchPlan.id))

    expect(live.getXmlFragment(fragmentName).toString()).toContain(locale === 'en' ? 'The launch' : 'El lanzamiento')
    expect(live.getXmlFragment(fragmentName).toString()).not.toMatch(/Legal/)
  })

  it('have anchors the contract accepts', async () => {
    const server = createMockServer({ demo: { locale, transport: null, scripts: [], page: fakePage().page } })
    const { items } = await server
      .connect({ signedInAs: marta.email })
      .listThreads({ params: { path: { documentId: launchPlan.id } } })

    for (const { anchor } of items) expect(anchorSchema.safeParse(anchor).success).toBe(true)
  })
})

describe('the starting content of a document', () => {
  it('is the same bytes every time, so every tab holds the same items and the anchors find them', () => {
    const blocks = demoContent.en[launchPlan.id] ?? []

    const first = seedContent(blocks, { anchoredOn: ['second week'] })
    const second = seedContent(blocks, { anchoredOn: ['second week'] })

    expect(second.update).toEqual(first.update)
    expect(second.anchors).toEqual(first.anchors)
  })
})
