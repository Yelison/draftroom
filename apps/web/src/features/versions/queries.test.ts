import { describe, expect, it } from 'vitest'
import { createMockDataSource } from '../../data/mock/createMockDataSource.ts'
import { keysAfterEvent, keysAfterMutation } from '../../data/queryKeys.ts'
import { launchPlan } from '../../data/mock/fixtures/documents.ts'
import { harborPine } from '../../data/mock/fixtures/index.ts'
import { versionContentQuery, versionsQuery } from './queries.ts'

const scope = { workspaceId: harborPine.id, documentId: launchPlan.id }
const dataSource = createMockDataSource()
const listKey = versionsQuery(dataSource, launchPlan.id).queryKey

// The list is under the key the table of invalidation marks stale: so a version saved or restored here, or by someone
// else (the event of the collaboration connection), is on the list when the screen is next read. The screen opens no
// connection of its own to receive that event (see `VersionsScreen`), so this is where the event's reach into the list is
// pinned. What a version held never changes, so none of those reaches it.
describe('what makes the list of versions stale', () => {
  it.each([
    { cause: 'saving a version', keys: keysAfterMutation('createVersion', scope) },
    { cause: 'restoring a version', keys: keysAfterMutation('restoreVersion', scope) },
    { cause: 'the versions-changed event', keys: keysAfterEvent('versions-changed', scope) },
  ])('includes it after $cause', ({ keys }) => {
    expect(keys.some((key) => key.every((part, index) => listKey[index] === part))).toBe(true)
  })

  it('does not reach the download of a version, which never changes', () => {
    const contentKey = versionContentQuery(dataSource, launchPlan.id, 'v-1').queryKey
    const stale = [
      ...keysAfterMutation('createVersion', scope),
      ...keysAfterMutation('restoreVersion', scope),
      ...keysAfterEvent('versions-changed', scope),
    ]

    expect(stale.filter((key) => key.every((part, index) => contentKey[index] === part))).toEqual([])
  })
})
