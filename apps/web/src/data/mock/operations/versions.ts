import type { DataSource } from '../../DataSource.ts'
import type { VersionRecord } from '../fixtures/collaboration.ts'
import { record } from '../events.ts'
import { caller, documentOf, requireRole, type Context } from '../guards.ts'
import { textLimits } from '../limits.ts'
import { paginate, readPage } from '../pagination.ts'
import { notFound } from '../problems.ts'
import { checkTexts } from '../text.ts'
import { versionView } from '../views.ts'

type VersionOperations = Pick<DataSource, 'listVersions' | 'createVersion' | 'restoreVersion'>

/** The size of a version stands in for the size of the document's state, which the mock does not keep. */
const defaultSizeBytes = 2048

export function versionOperations(ctx: Context): VersionOperations {
  const { world } = ctx

  const versionsOf = (documentId: string) => world.versions.filter((row) => row.documentId === documentId)

  function addVersion(
    documentId: string,
    kind: VersionRecord['kind'],
    createdBy: string,
    label: string | null,
    sizeBytes: number,
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
    return version
  }

  const latestSize = (documentId: string) =>
    versionsOf(documentId).reduce<VersionRecord | undefined>(
      (latest, row) => (latest === undefined || row.createdAt > latest.createdAt ? row : latest),
      undefined,
    )?.sizeBytes ?? defaultSizeBytes

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
      const version = addVersion(document.id, 'manual', user.id, label, latestSize(document.id))
      record(world, 'version.created', user.id, document.id)
      return versionView(world, version)
    },

    restoreVersion: async ({ params: { path } }) => {
      const user = caller(ctx)
      const target = world.versions.find((row) => row.id === path.versionId)
      if (target === undefined) throw notFound()
      const { document, role } = documentOf(ctx, target.documentId)
      requireRole(role, 'owner')

      // What the document held before the restore is kept, then the restored state is saved as the newest version.
      addVersion(document.id, 'pre-restore', user.id, null, latestSize(document.id))
      const restored = addVersion(document.id, 'restore', user.id, target.label, target.sizeBytes)
      record(world, 'version.restored', user.id, document.id)
      return versionView(world, restored)
    },
  }
}
