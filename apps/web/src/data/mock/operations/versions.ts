// The mock plays the server, which stores versions as Yjs updates and so may build them.
// oxlint-disable-next-line no-restricted-imports
import { jsonToYUpdate } from '@draftroom/editor-schema/convert'
import type { DataSource } from '../../DataSource.ts'
import type { VersionRecord } from '../fixtures/collaboration.ts'
import { record } from '../events.ts'
import { caller, documentOf, requireRole, type Context } from '../guards.ts'
import { textLimits } from '../limits.ts'
import { paginate, readPage } from '../pagination.ts'
import { notFound } from '../problems.ts'
import { checkTexts } from '../text.ts'
import { versionView } from '../views.ts'

type VersionOperations = Pick<DataSource, 'listVersions' | 'createVersion' | 'getVersionContent' | 'restoreVersion'>

/** The size of a version stands in for the size of the document's state, which the mock does not measure. */
const defaultSizeBytes = 2048

/** An empty document: what a version holds when nothing before it did. */
const emptyContent = () => jsonToYUpdate({ type: 'doc', content: [{ type: 'paragraph' }] })

export function versionOperations(ctx: Context): VersionOperations {
  const { world } = ctx

  const versionsOf = (documentId: string) => world.versions.filter((row) => row.documentId === documentId)

  function addVersion(
    documentId: string,
    kind: VersionRecord['kind'],
    createdBy: string,
    label: string | null,
    sizeBytes: number,
    content: Uint8Array,
  ): VersionRecord {
    const version: VersionRecord = {
      id: world.newId(),
      documentId,
      kind,
      label,
      createdBy,
      createdAt: world.now(),
      sizeBytes,
    }
    world.versions.push(version)
    world.versionContent.set(version.id, content)
    return version
  }

  const latestOf = (documentId: string) =>
    versionsOf(documentId).reduce<VersionRecord | undefined>(
      (latest, row) => (latest === undefined || row.createdAt > latest.createdAt ? row : latest),
      undefined,
    )
  const latestSize = (documentId: string) => latestOf(documentId)?.sizeBytes ?? defaultSizeBytes
  const contentOf = (versionId: string) => {
    const kept = world.versionContent.get(versionId)
    if (kept !== undefined) return kept
    const fixture = world.fixtureVersionContent[versionId]
    return fixture === undefined ? emptyContent() : jsonToYUpdate(fixture)
  }
  return {
    listVersions: async ({ params: { path, query = {} } }) => {
      caller(ctx)
      const page = readPage(query, { documentId: path.documentId })
      const { document } = documentOf(ctx, path.documentId)
      const { items, nextCursor } = paginate(
        versionsOf(document.id),
        { key: (row) => row.createdAt, id: (row) => row.id, direction: 'desc' },
        page,
      )
      return { items: items.map((row) => versionView(world, row)), nextCursor }
    },

    createVersion: async ({ params: { path }, body }) => {
      const user = caller(ctx)
      const label = body?.label ?? null
      if (label !== null) checkTexts(['/label', label, textLimits.versionLabel])
      const { document, role } = documentOf(ctx, path.documentId)
      requireRole(role, 'editor')
      const version = addVersion(
        document.id,
        'manual',
        user.id,
        label,
        latestSize(document.id),
        ctx.live.state(document.id),
      )
      record(world, 'version.created', user.id, document.id)
      return versionView(world, version)
    },

    getVersionContent: async ({ params: { path } }) => {
      caller(ctx)
      const version = world.versions.find((row) => row.id === path.versionId)
      if (version === undefined) throw notFound()
      // Reading a version needs to read its document, which is `404` when the caller cannot.
      documentOf(ctx, version.documentId)
      return contentOf(version.id)
    },

    restoreVersion: async ({ params: { path } }) => {
      const user = caller(ctx)
      const target = world.versions.find((row) => row.id === path.versionId)
      if (target === undefined) throw notFound()
      const { document, role } = documentOf(ctx, target.documentId)
      requireRole(role, 'owner')

      // What the document held before the restore is kept, then the restored state is saved as the newest version.
      addVersion(document.id, 'pre-restore', user.id, null, latestSize(document.id), ctx.live.state(document.id))
      ctx.live.replace(document.id, contentOf(target.id))
      const restored = addVersion(
        document.id,
        'restore',
        user.id,
        target.label,
        target.sizeBytes,
        ctx.live.state(document.id),
      )
      record(world, 'version.restored', user.id, document.id)
      return versionView(world, restored)
    },
  }
}
