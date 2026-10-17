import { documentName } from '@draftroom/contract/collab'
import { fragmentName } from '@draftroom/editor-schema'
// oxlint-disable-next-line no-restricted-imports
import { jsonToYUpdate, yUpdateToJson } from '@draftroom/editor-schema/convert'
import type { JSONContent } from '@tiptap/core'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import type { Locale } from '../../../i18n/locale.ts'
import { createMockServer } from '../createMockDataSource.ts'
import { collaboratorScripts } from '../fixtures/collaboratorScripts.ts'
import { demoContent } from '../fixtures/demoContent.ts'
import { demoFixtures } from '../fixtures/demoSeed.ts'
import { documents, interviews, launchPlan, weeklyEnglish } from '../fixtures/documents.ts'
import { marta } from '../fixtures/index.ts'
import { seedId } from '../ids.ts'
import { createWorld } from '../world.ts'
import { fakePage } from './fakePage.ts'

/** The words of a document, one paragraph or heading to a line: what a person who opens it reads. */
const linesOf = (content: JSONContent): string[] =>
  content.type === 'paragraph' || content.type === 'heading'
    ? [(content.content ?? []).map((part) => part.text ?? '').join('')]
    : (content.content ?? []).flatMap(linesOf)

const textOf = (update: Uint8Array) => linesOf(yUpdateToJson(update))
const contentOf = (locale: Locale, documentId: string) => ({
  type: 'doc',
  content: [...(demoContent[locale][documentId] ?? [])],
})
const liveText = (server: ReturnType<typeof createMockServer>, documentId: string) =>
  textOf(Y.encodeStateAsUpdate(server.collaboration.document(documentName(documentId))))

const demo = (locale: Locale) => ({ locale, transport: null, scripts: [], page: fakePage().page })
const locales = ['en', 'es'] as const

describe('the documents of the demo', () => {
  it('open with their text in the language the demo started in', () => {
    const english = createMockServer({ demo: demo('en') })
    const spanish = createMockServer({ demo: demo('es') })

    expect(liveText(english, launchPlan.id)[0]).toBe(
      'The launch moves to the second week of November, once the pricing review is signed off.',
    )
    expect(liveText(spanish, launchPlan.id)[0]).toBe(
      'El lanzamiento pasa a la segunda semana de noviembre, cuando se apruebe la revisión de precios.',
    )
  })

  it('are written when they are opened, not when the demo starts', () => {
    const server = createMockServer({ demo: demo('en') })
    const name = documentName(weeklyEnglish.id)
    expect(server.collaboration.hasDocument(name)).toBe(false)

    server.collaboration.document(name)

    expect(server.collaboration.hasDocument(name)).toBe(true)
  })

  it('start empty everywhere else: the mock of the tests is not the demo', () => {
    const server = createMockServer()

    const fragment = server.collaboration.document(documentName(launchPlan.id)).getXmlFragment(fragmentName)

    expect(fragment.length).toBe(0)
  })

  for (const locale of locales) {
    it(`all have something to read in ${locale}, that the editor can open, and that does not repeat the title`, () => {
      for (const { id, title } of demoFixtures(locale).seed.documents) {
        const lines = textOf(jsonToYUpdate(contentOf(locale, id)))
        expect(lines.length, title).toBeGreaterThan(2)
        expect(
          lines.every((line) => line.trim().length > 0),
          title,
        ).toBe(true)
        expect(lines[0], title).not.toBe(title)
      }
    })
  }
})

describe('the world of the demo', () => {
  it('has one set of documents, with everything a person reads in the language of the demo', async () => {
    const [english, spanish] = locales.map((locale) => demoFixtures(locale).seed)

    expect(english?.documents.map((row) => row.id)).toEqual(spanish?.documents.map((row) => row.id))
    expect(english?.documents).toHaveLength(8)
    const readable = (seed: typeof english) => [
      ...(seed?.documents.flatMap((row) => [row.title, row.excerpt ?? '']) ?? []),
      ...(seed?.folders.map((row) => row.name) ?? []),
      ...(seed?.threads.flatMap((row) => [row.quote, ...row.comments.map((comment) => comment.body)]) ?? []),
    ]
    const inBoth = readable(english).filter((text) => readable(spanish).includes(text))
    expect(inBoth, 'what is the same in both languages: a name that is not translated').toEqual(['Ideas'])
  })

  it('keeps the world of the tests as it was, with both languages side by side', () => {
    expect(createWorld().documents).toHaveLength(documents.length)
  })

  it('lists no document, grant, pin or comment of a document it does not have', () => {
    for (const locale of locales) {
      const { seed } = demoFixtures(locale)
      const ids = new Set(seed.documents.map((row) => row.id))
      const references = [...seed.grants, ...seed.pins, ...seed.threads, ...seed.versions, ...seed.activity].map(
        (row) => row.documentId,
      )
      expect(
        references.every((id) => ids.has(id)),
        locale,
      ).toBe(true)
    }
  })

  it('anchors each comment in text that its document has', () => {
    for (const locale of locales) {
      for (const { documentId, quote } of demoFixtures(locale).seed.threads) {
        expect(textOf(jsonToYUpdate(contentOf(locale, documentId))).join('\n'), `${locale}: ${quote}`).toContain(quote)
      }
    }
  })

  for (const locale of locales) {
    it(`has its stored versions in ${locale}, and the plan continues the last of them`, async () => {
      const server = createMockServer({ demo: demo(locale) })
      const api = server.connect({ signedInAs: marta.email })
      const lastOfPlan = seedId(7, 3)
      const lastOfInterviews = seedId(7, 4)
      const params = (versionId: string) => ({ params: { path: { versionId } } })

      const plan = textOf(await api.getVersionContent(params(lastOfPlan)))
      const interviewsStored = textOf(await api.getVersionContent(params(lastOfInterviews)))

      expect(liveText(server, launchPlan.id).slice(0, plan.length)).toEqual(plan)
      expect(liveText(server, interviews.id).slice(0, interviewsStored.length)).toEqual(interviewsStored)
      expect(plan.join(' ')).toContain(locale === 'en' ? 'second week of November' : 'segunda semana de noviembre')
    })

    it(`leaves a text in ${locale} when a version is restored`, async () => {
      const server = createMockServer({ demo: demo(locale) })
      const api = server.connect({ signedInAs: marta.email })

      await api.restoreVersion({ params: { path: { versionId: seedId(7, 1) } } })

      expect(liveText(server, launchPlan.id).join(' ')).toContain(
        locale === 'en' ? 'first week of November' : 'primera semana de noviembre',
      )
    })
  }
})

describe('the lines of the collaborators', () => {
  it('continue the last paragraph of their document, in both languages', () => {
    for (const { documentId, lines } of collaboratorScripts) {
      for (const locale of locales) {
        const content = demoContent[locale][documentId]
        expect(content?.at(-1)?.type, `${documentId} in ${locale}`).toBe('paragraph')
        expect(content?.at(-1)?.content?.length, 'plain text, which is what she adds to').toBe(1)
        expect(lines[locale].length).toBeGreaterThan(1)
        for (const { draft, final } of lines[locale]) {
          expect(draft.startsWith(' ') && final.startsWith(' ')).toBe(true)
        }
      }
    }
  })
})
