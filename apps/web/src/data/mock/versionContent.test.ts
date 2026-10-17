// A test may ask what the server would make of what the mock serves: the update must load as the server's own does.
// oxlint-disable-next-line no-restricted-imports
import { replaceFragmentContent, yUpdateToJson } from '@draftroom/editor-schema/convert'
import { fragmentName } from '@draftroom/editor-schema'
import { documentName } from '@draftroom/contract/collab'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { isApiError } from '../errors.ts'
import { createMockServer } from './createMockDataSource.ts'
import { launchPlan } from './fixtures/documents.ts'
import { marta, wei } from './fixtures/index.ts'
import { versions } from './fixtures/collaboration.ts'

const versionOf = (id: string) => ({ params: { path: { versionId: id } } })
const documentOf = (id: string) => ({ params: { path: { documentId: id } } })
const paragraph = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const textOf = (json: ReturnType<typeof yUpdateToJson>) => JSON.stringify(json)

describe('the content of a version in the mock', () => {
  it('is a Yjs update that loads as the server would read it, with the text of that version', async () => {
    const api = createMockServer().connect({ signedInAs: marta.email })

    const update = await api.getVersionContent(versionOf(versions[1]!.id))

    expect(textOf(yUpdateToJson(update))).toContain('The launch moves to the second week of November.')
  })

  it('is different for each version of a document', async () => {
    const api = createMockServer().connect({ signedInAs: marta.email })

    const [first, second] = await Promise.all(
      versions.slice(0, 2).map((version) => api.getVersionContent(versionOf(version.id))),
    )

    expect(textOf(yUpdateToJson(first!))).not.toEqual(textOf(yUpdateToJson(second!)))
  })

  it('holds, for a version saved later, what was written in the document by then', async () => {
    const server = createMockServer()
    const api = server.connect({ signedInAs: marta.email })
    const live = server.collaboration.document(documentName(launchPlan.id))
    replaceFragmentContent(live.getXmlFragment(fragmentName), paragraph('Written just before saving'))

    const saved = await api.createVersion(documentOf(launchPlan.id))

    expect(textOf(yUpdateToJson(await api.getVersionContent(versionOf(saved.id))))).toContain(
      'Written just before saving',
    )
  })

  it('keeps, in the version before a restore, what the document held, and puts the restored text in the document', async () => {
    const server = createMockServer()
    const api = server.connect({ signedInAs: marta.email })
    const live = server.collaboration.document(documentName(launchPlan.id))
    replaceFragmentContent(live.getXmlFragment(fragmentName), paragraph('Typed before the restore'))

    const restored = await api.restoreVersion(versionOf(versions[0]!.id))

    const [first, second] = (await api.listVersions(documentOf(launchPlan.id))).items
    expect(first?.id).toBe(restored.id)
    expect(second?.kind).toBe('pre-restore')
    expect(textOf(yUpdateToJson(await api.getVersionContent(versionOf(second!.id))))).toContain(
      'Typed before the restore',
    )
    expect(textOf(yUpdateToJson(Y.encodeStateAsUpdate(live)))).toContain('first week of November')
    expect(textOf(yUpdateToJson(Y.encodeStateAsUpdate(live)))).not.toContain('Typed before the restore')
  })

  it('is not there for a version that does not exist', async () => {
    const api = createMockServer().connect({ signedInAs: marta.email })

    const error = await api
      .getVersionContent(versionOf('00000000-0000-4000-8000-00000000dead'))
      .catch((e: unknown) => e)

    expect(isApiError(error, 'not-found')).toBe(true)
  })

  it('is not there for someone who cannot read the document, which looks the same as not existing', async () => {
    const stranger = createMockServer().connect({ signedInAs: wei.email })

    const error = await stranger.getVersionContent(versionOf(versions[0]!.id)).catch((e: unknown) => e)

    expect(isApiError(error, 'not-found')).toBe(true)
  })
})
