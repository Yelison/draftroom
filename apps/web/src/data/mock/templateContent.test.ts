import { documentName } from '@draftroom/contract/collab'
import { jsonToYUpdate, yUpdateToJson } from '@draftroom/editor-schema/convert'
import type { JSONContent } from '@tiptap/core'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createMockServer } from './createMockDataSource.ts'
import { marta } from './fixtures/index.ts'
import { templateContent } from './fixtures/templateContent.ts'
import { templates } from './fixtures/templates.ts'
import { harborPine } from './fixtures/workspaces.ts'

const serverTemplate = (locale: string, id: string): { name: string; description: string; content: JSONContent } =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, `../../../../server/src/domain/templates/${locale}/${id}.json`), 'utf8'),
  )

/** The content as the editor stores it, which adds the attributes the schema defaults (a list's start). */
const asStored = (content: JSONContent) => yUpdateToJson(jsonToYUpdate(content))

const cases = templates.flatMap(({ id }) => (['en', 'es'] as const).map((locale) => [locale, id] as const))

describe('the templates of the mock', () => {
  it.each(cases)('say what the server says in %s: %s', (locale, id) => {
    const fromServer = serverTemplate(locale, id)
    const own = templates.find((row) => row.id === id)?.text[locale]

    expect({ name: own?.name, description: own?.description }).toEqual({
      name: fromServer.name,
      description: fromServer.description,
    })
    expect(asStored({ type: 'doc', content: [...(templateContent[locale][id] ?? [])] })).toEqual(
      asStored(fromServer.content),
    )
  })

  const contentOf = (server: ReturnType<typeof createMockServer>, documentId: string) =>
    yUpdateToJson(Y.encodeStateAsUpdate(server.collaboration.document(documentName(documentId))))

  it('start the document they create with their content, in the language asked for', async () => {
    const server = createMockServer()
    const created = await server.connect({ signedInAs: marta.email }).createDocument({
      params: { path: { workspaceId: harborPine.id } },
      body: { title: 'Reunión', templateId: 'meeting-notes', locale: 'es' },
    })

    expect(contentOf(server, created.id)).toEqual(asStored(serverTemplate('es', 'meeting-notes').content))
  })

  it('leave a blank document empty', async () => {
    const server = createMockServer()
    const created = await server
      .connect({ signedInAs: marta.email })
      .createDocument({ params: { path: { workspaceId: harborPine.id } }, body: { title: 'Blank' } })

    expect(server.collaboration.document(documentName(created.id)).share.size).toBe(0)
  })
})
