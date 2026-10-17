import { describe, expect, it } from 'vitest'
import { createMockDataSource } from '../../data/mock/createMockDataSource.ts'
import { keysAfterEvent, keysAfterMutation } from '../../data/queryKeys.ts'
import { launchPlan } from '../../data/mock/fixtures/documents.ts'
import { harborPine } from '../../data/mock/fixtures/index.ts'
import { versionContentQuery, versionsQuery } from './queries.ts'

const scope = { workspaceId: harborPine.id, documentId: launchPlan.id }
const dataSource = createMockDataSource()
const listKey = versionsQuery(dataSource, launchPlan.id).queryKey

// The list and what a preview downloaded are one prefix of the cache, which is the key the table of invalidation marks
// stale: so a version saved or restored here, or by someone else (the event of the collaboration connection), is on the
// list when the screen is next read. The screen opens no connection of its own to receive that event (see `VersionsScreen`),
// so this is where the event's reach into the list is pinned.
describe('what makes the list of versions stale', () => {
  it.each([
    { cause: 'saving a version', keys: keysAfterMutation('createVersion', scope) },
    { cause: 'restoring a version', keys: keysAfterMutation('restoreVersion', scope) },
    { cause: 'the versions-changed event', keys: keysAfterEvent('versions-changed', scope) },
  ])('includes it after $cause', ({ keys }) => {
    expect(keys.some((key) => key.every((part, index) => listKey[index] === part))).toBe(true)
  })

  it('also reaches the download of a version, which a restore does not change', () => {
    const contentKey = versionContentQuery(dataSource, launchPlan.id, 'v-1').queryKey

    expect(contentKey.slice(0, listKey.length)).toEqual([...listKey])
  })
})
