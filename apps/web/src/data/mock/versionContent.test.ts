// A test may ask what the server would make of what the mock serves: the update must load as the server's own does.
// oxlint-disable-next-line no-restricted-imports
import { yUpdateToJson } from '@draftroom/editor-schema/convert'
import { describe, expect, it } from 'vitest'
import { isApiError } from '../errors.ts'
import { createMockServer } from './createMockDataSource.ts'
import { launchPlan } from './fixtures/documents.ts'
import { marta, wei } from './fixtures/index.ts'
import { versions } from './fixtures/collaboration.ts'

const versionOf = (id: string) => ({ params: { path: { versionId: id } } })
const documentOf = (id: string) => ({ params: { path: { documentId: id } } })
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

  it('holds, for a version saved later, what the latest one held, and a restore holds what it went back to', async () => {
    const api = createMockServer().connect({ signedInAs: marta.email })
    const target = versions[0]!

    const saved = await api.createVersion(documentOf(launchPlan.id))
    const restored = await api.restoreVersion(versionOf(target.id))

    expect(textOf(yUpdateToJson(await api.getVersionContent(versionOf(saved.id))))).toEqual(
      textOf(yUpdateToJson(await api.getVersionContent(versionOf(versions[2]!.id)))),
    )
    expect(textOf(yUpdateToJson(await api.getVersionContent(versionOf(restored.id))))).toEqual(
      textOf(yUpdateToJson(await api.getVersionContent(versionOf(target.id)))),
    )
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
