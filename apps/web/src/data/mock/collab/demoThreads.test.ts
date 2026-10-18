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
import { demoDocument } from './demoDocuments.ts'
import { bold, paragraph } from '../fixtures/blocks.ts'
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

    const first = seedContent(blocks, { writtenBy: 'en:plan', anchoredOn: ['second week'] })
    const second = seedContent(blocks, { writtenBy: 'en:plan', anchoredOn: ['second week'] })

    expect(second.update).toEqual(first.update)
    expect(second.anchors).toEqual(first.anchors)
  })

  it('has a writer of its own for each language, so a copy kept in one language is not taken for the other', () => {
    const english = demoDocument('en', launchPlan.id)
    const spanish = demoDocument('es', launchPlan.id)
    if (english === undefined || spanish === undefined) throw new Error('The launch plan has no text')

    // A browser that kept the English copy and is given the Spanish text: both are in the document, none replaces the other.
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, english.update)
    Y.applyUpdate(ydoc, spanish.update)

    expect(Y.decodeUpdate(english.update).structs[0]?.id.client).not.toBe(
      Y.decodeUpdate(spanish.update).structs[0]?.id.client,
    )
    const text = ydoc.getXmlFragment(fragmentName).toString()
    expect(text).toContain('The launch moves')
    expect(text).toContain('El lanzamiento pasa')
    ydoc.destroy()
  })
})

/** The first writer of an update: the client of its first struct. */
const writerOf = (update: Uint8Array) => Y.decodeUpdate(update).structs[0]?.id.client

/** What an anchor covers in the document that this update starts, as a client that opened it would read it. */
function covers(update: Uint8Array, anchor: Parameters<typeof resolveAnchor>[1]): string | null {
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, update)
  const editor = new Editor({
    extensions: [...editorExtensions(), Collaboration.configure({ document: ydoc, field: fragmentName })],
  })
  try {
    const bound = boundDocumentOf(editor.state)
    if (bound === null) throw new Error('The editor is not bound to the document')
    const range = resolveAnchor(bound, anchor)
    return range === null ? null : editor.state.doc.textBetween(range.from, range.to, ' ')
  } finally {
    editor.destroy()
    ydoc.destroy()
  }
}

describe('the writer of the starting text', () => {
  const plan = [paragraph('The launch moves to November.')]
  const edited = [paragraph('The launch moves to the second week of November.')]

  it('is the same for the same text, so every tab and every reload holds the same items', () => {
    const first = seedContent(plan, { writtenBy: 'en:plan', anchoredOn: [] })
    const again = seedContent(plan, { writtenBy: 'en:plan', anchoredOn: [] })

    expect(writerOf(again.update)).toBe(writerOf(first.update))
  })

  it('is another for a text that was edited, so a copy kept of the old one is not mixed with the new', () => {
    const before = seedContent(plan, { writtenBy: 'en:plan', anchoredOn: [] })
    const after = seedContent(edited, { writtenBy: 'en:plan', anchoredOn: [] })

    expect(writerOf(after.update)).not.toBe(writerOf(before.update))
    // The copy of the old text and the new text, put together, hold both: neither overwrites the other.
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, before.update)
    Y.applyUpdate(ydoc, after.update)
    expect(ydoc.getXmlFragment(fragmentName).toString()).toContain('the second week of November')
    expect(ydoc.getXmlFragment(fragmentName).toString()).toContain('moves to November')
  })
})

describe('the anchors of a quote that comes after other characters', () => {
  // Yjs counts in UTF-16 units and the text of a node carries the tags of its formatting: an index taken any other way
  // is a few characters off.
  const blocks = [paragraph('😀 and ', bold('bold'), ' then the quote here, with 😀 in it.')]
  const quotes = [
    { where: 'after an emoji and a bold run', quote: 'the quote here' },
    { where: 'with an emoji in it', quote: '😀 in it' },
    { where: 'at the bold run itself', quote: 'bold' },
  ]

  it.each(quotes)('covers the quote $where', ({ quote }) => {
    const { update, anchors } = seedContent(blocks, { writtenBy: 'en:marks', anchoredOn: [quote] })

    const anchor = anchors.get(quote)
    if (anchor === undefined) throw new Error('No anchor was made')
    expect(covers(update, anchor)).toBe(quote)
  })
})
