import { documentName } from '@draftroom/contract/collab'
import { fragmentName } from '@draftroom/editor-schema'
// oxlint-disable-next-line no-restricted-imports
import { jsonToYUpdate, yUpdateToJson } from '@draftroom/editor-schema/convert'
import type { JSONContent } from '@tiptap/core'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { createMockServer } from '../createMockDataSource.ts'
import { collaboratorScripts } from '../fixtures/collaboratorScripts.ts'
import { demoContent } from '../fixtures/demoContent.ts'
import { documents, launchPlan, weeklyEnglish } from '../fixtures/documents.ts'
import { versionContent } from '../fixtures/versionContent.ts'
import { seedId } from '../ids.ts'
import { fakePage } from './fakePage.ts'

/** The words of a document, one paragraph or heading to a line: what a person who opens it reads. */
const linesOf = (content: JSONContent): string[] =>
  content.type === 'paragraph' || content.type === 'heading'
    ? [(content.content ?? []).map((part) => part.text ?? '').join('')]
    : (content.content ?? []).flatMap(linesOf)

const textOf = (update: Uint8Array) => linesOf(yUpdateToJson(update))

const demo = (locale: 'en' | 'es') => ({ locale, transport: null, scripts: [], page: fakePage().page })

describe('the documents of the demo', () => {
  it('open with their text in the language the demo started in', () => {
    const english = createMockServer({ demo: demo('en') })
    const spanish = createMockServer({ demo: demo('es') })
    const name = documentName(launchPlan.id)

    expect(textOf(Y.encodeStateAsUpdate(english.collaboration.document(name)))[0]).toBe('Autumn launch plan')
    expect(textOf(Y.encodeStateAsUpdate(spanish.collaboration.document(name)))[0]).toBe('Plan de lanzamiento de otoño')
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

  it('all have something to read, in both languages, that the editor can open', () => {
    for (const locale of ['en', 'es'] as const) {
      for (const { id, title } of documents) {
        const content = demoContent[locale][id]
        expect(content, `${title} in ${locale}`).toBeDefined()
        const lines = textOf(jsonToYUpdate({ type: 'doc', content: [...(content ?? [])] }))
        expect(lines.length, `${title} in ${locale}`).toBeGreaterThan(2)
        expect(
          lines.every((line) => line.trim().length > 0),
          `${title} in ${locale}`,
        ).toBe(true)
      }
    }
  })

  it('continue the last stored version of the launch plan', () => {
    const lastVersion = versionContent[seedId(7, 3)]
    const stored = lastVersion === undefined ? [] : linesOf(lastVersion)

    expect(textOf(jsonToYUpdate({ type: 'doc', content: [...(demoContent.en[launchPlan.id] ?? [])] }))).toEqual(
      expect.arrayContaining(stored),
    )
  })
})

describe('the lines of the collaborators', () => {
  it('continue the last paragraph of their document, in both languages', () => {
    for (const { documentId, lines } of collaboratorScripts) {
      for (const locale of ['en', 'es'] as const) {
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
