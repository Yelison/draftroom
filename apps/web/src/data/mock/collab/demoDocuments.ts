import type { Locale } from '../../../i18n/locale.ts'
import { demoContent } from '../fixtures/demoContent.ts'
import { demoThreads, threadText, withdrawnBlocks } from '../fixtures/demoThreads.ts'
import type { Fixtures } from '../fixtures/index.ts'
import { seedContent, type SeededContent } from './seededContent.ts'

const seeded = new Map<string, SeededContent>()

/**
 * What a document of the demo starts with in `locale`: its text, and the anchors of the threads on it. Made once for each
 * language and document, because the same bytes must come out every time (`seededContent.ts`). A document with no text
 * of its own starts empty, so it has none.
 */
export function demoDocument(locale: Locale, documentId: string): SeededContent | undefined {
  const blocks = demoContent[locale][documentId]
  if (blocks === undefined) return undefined
  const key = `${locale}:${documentId}`
  let content = seeded.get(key)
  if (content === undefined) {
    const quotes = demoThreads
      .filter((thread) => thread.documentId === documentId)
      .flatMap((thread) => threadText[locale][thread.id]?.quote ?? [])
    content = seedContent(blocks, { anchoredOn: quotes, withdrawn: withdrawnBlocks[locale][documentId] ?? [] })
    seeded.set(key, content)
  }
  return content
}

/**
 * The fixtures of the demo with each thread anchored in the text of its document, in `locale`: the comments land on the
 * sentences they quote, and the one whose text was taken out is orphaned.
 */
export function withDemoAnchors(fixtures: Fixtures, locale: Locale): Fixtures {
  const quoteOf = (threadId: string) => threadText[locale][threadId]?.quote
  return {
    ...fixtures,
    seed: {
      ...fixtures.seed,
      threads: fixtures.seed.threads.map((thread) => {
        const quote = quoteOf(thread.id)
        const anchor = quote === undefined ? undefined : demoDocument(locale, thread.documentId)?.anchors.get(quote)
        return anchor === undefined ? thread : { ...thread, anchor }
      }),
    },
  }
}
