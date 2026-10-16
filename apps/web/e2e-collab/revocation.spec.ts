import { RECONNECT_INITIAL_DELAY_MS } from '@draftroom/contract/collab'
import { storedText } from './database.ts'
import { expect, test, type Participant } from './fixtures.ts'
import type { DemoPerson } from './people.ts'
import { createDocument, revokeAccess } from './scene.ts'

const shared = 'The plan is shared with Priya.'
const offlineText = ' Priya adds the confidential figures.'

/**
 * Review Focus 4, up to the moment she is back: the owner and an editor have the document open, the editor loses the
 * connection and writes (what she writes is on her device and nowhere else), the owner takes her access away, and her
 * connection comes back.
 */
async function accessRemovedDuringTheOutage(join: (person: DemoPerson) => Promise<Participant>) {
  const documentId = await createDocument('daniel', ['priya'])
  const daniel = await join('daniel')
  const priya = await join('priya')
  priya.toleratesConnectionErrors()
  await daniel.open(documentId)
  await priya.open(documentId)
  await daniel.typeAtEnd(shared)
  await expect.poll(() => priya.text()).toBe(shared)

  await priya.context.setOffline(true)
  await expect(priya.syncStatus).toHaveText('Sync status: Offline with local copy')
  await priya.typeAtEnd(offlineText)
  await expect(priya.syncStatus).toHaveText('Sync status: Offline with local copy')
  expect(await priya.localCopies(), 'her device keeps what she wrote').toHaveLength(1)

  await revokeAccess('daniel', documentId, 'priya')
  await priya.context.setOffline(false)
  return { documentId, daniel, priya }
}

test.describe('access removed while the person was offline', () => {
  test('what they wrote offline never reaches the server', async ({ join }) => {
    const { documentId, daniel, priya } = await accessRemovedDuringTheOutage(join)

    // Whatever the screen of the returning person says, her connection had the time to come back and send what she wrote.
    await expect(priya.page.getByRole('heading', { name: /access .* removed|isn't available/ })).toBeVisible()
    await priya.page.waitForTimeout(3 * RECONNECT_INITIAL_DELAY_MS)
    // The owner keeps writing. The state the server stores is complete, so once this is in the database everything that
    // reached the server before it is in it too, and the absence of Priya's text is proved and not merely late.
    await daniel.typeAtEnd(' Daniel carries on.')
    await expect(daniel.syncStatus).toHaveText('Sync status: Synced')
    await expect.poll(() => storedText(documentId)).toBe(`${shared} Daniel carries on.`)
    expect(await daniel.text()).toBe(`${shared} Daniel carries on.`)
  })

  // FINDING (see the delivery of t24): when the connection comes back the screen asks the API for the document again, which
  // now answers 404, and the editor is taken out of the page, with its session, before the server has told the session
  // that the access is gone. The session is the one that deletes the copy, so the copy stays on the device. Remove
  // `test.fail` when the product purges the copy on this path: the test will then fail on the annotation itself.
  test('their offline copy is purged from the device', async ({ join }) => {
    test.fail(true, 'the offline copy outlives the removal of access when the document query answers 404 first')
    const { priya } = await accessRemovedDuringTheOutage(join)

    await expect.poll(() => priya.localCopies(), { timeout: 15_000 }).toEqual([])
  })

  // FINDING, the same cause: the screen of the returning person says that the document is not available, not that the
  // access was removed (Review Focus 4).
  test('their screen says that the access was removed', async ({ join }) => {
    test.fail(true, 'the screen shows the 404 of the document query instead of the removal of access')
    const { priya } = await accessRemovedDuringTheOutage(join)

    await expect(priya.page.getByRole('heading', { name: 'Your access to this document was removed' })).toBeVisible()
  })
})
