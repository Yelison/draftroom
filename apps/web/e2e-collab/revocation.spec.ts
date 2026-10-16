import { RECONNECT_INITIAL_DELAY_MS } from '@draftroom/contract/collab'
import { storedText } from './database.ts'
import { expect, test, type Participant } from './fixtures.ts'
import type { DemoPerson } from './people.ts'
import { createDocument, revokeAccess } from './scene.ts'

const shared = 'The plan is shared with Priya.'
const offlineText = ' Priya adds the confidential figures.'

/** Which answer reaches the screen of the returning person first: the server's refusal of her connection, or the API's 404. */
type FirstAnswer = 'collaboration-server' | 'api'

/**
 * Review Focus 4, up to the moment she is back: the owner and an editor have the document open, the editor loses the
 * connection and writes (what she writes is on her device and nowhere else), the owner takes her access away, and her
 * connection comes back.
 *
 * When she is back the screen asks the API for the document again and the connection asks the collaboration server to let
 * her in, and both are refused. Which refusal arrives first depends on the network, and the screen has to be right either
 * way; the tests below hold back the API's answer to see the connection's refusal alone, and let it through to see its own.
 */
async function accessRemovedDuringTheOutage(join: (person: DemoPerson) => Promise<Participant>, first: FirstAnswer) {
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
  if (first === 'collaboration-server') {
    // A request that is never answered: the document the screen already has stays on it until the connection says more.
    await priya.page.route(
      (url) => url.pathname === `/api/documents/${documentId}`,
      () => new Promise<void>(() => {}),
    )
  }
  await priya.context.setOffline(false)
  return { documentId, daniel, priya }
}

test.describe('access removed while the person was offline, when the collaboration server refuses her first', () => {
  test('what they wrote offline never reaches the server', async ({ join }) => {
    const { documentId, daniel, priya } = await accessRemovedDuringTheOutage(join, 'collaboration-server')

    await expect(priya.page.getByRole('heading', { name: 'Your access to this document was removed' })).toBeVisible()
    // Her connection has had the time to come back and send what she wrote, if the server had let it.
    await priya.page.waitForTimeout(3 * RECONNECT_INITIAL_DELAY_MS)
    // The owner keeps writing. The state the server stores is complete, so once this is in the database everything that
    // reached the server before it is in it too, and the absence of Priya's text is proved and not merely late.
    await daniel.typeAtEnd(' Daniel carries on.')
    await expect(daniel.syncStatus).toHaveText('Sync status: Synced')
    await expect.poll(() => storedText(documentId)).toBe(`${shared} Daniel carries on.`)
    expect(await daniel.text()).toBe(`${shared} Daniel carries on.`)
  })

  test('their offline copy is purged from the device', async ({ join }) => {
    const { priya } = await accessRemovedDuringTheOutage(join, 'collaboration-server')

    await expect.poll(() => priya.localCopies()).toEqual([])
  })

  test('their screen says that the access was removed', async ({ join }) => {
    const { priya } = await accessRemovedDuringTheOutage(join, 'collaboration-server')

    await expect(priya.page.getByRole('heading', { name: 'Your access to this document was removed' })).toBeVisible()
    await expect(priya.page.getByRole('link', { name: 'Go to Documents' })).toBeVisible()
  })
})

// FINDING (see the delivery of t24): when the API's 404 arrives first, which is what happens without a held-back answer,
// the editor is taken out of the page, with its session, before the collaboration server has told the session that the
// access is gone. It is the session that deletes the copy, so the copy stays on the device, and the screen says that the
// document is not available. Remove `test.fail` when the product handles this order: the test will then fail on the
// annotation itself.
test.describe('access removed while the person was offline, when the API refuses her first', () => {
  test('their offline copy is purged from the device', async ({ join }) => {
    test.fail(true, 'the offline copy outlives the removal of access when the document query answers 404 first')
    const { priya } = await accessRemovedDuringTheOutage(join, 'api')

    await expect.poll(() => priya.localCopies(), { timeout: 15_000 }).toEqual([])
  })

  test('their screen says that the access was removed', async ({ join }) => {
    test.fail(true, 'the screen shows the 404 of the document query instead of the removal of access')
    const { priya } = await accessRemovedDuringTheOutage(join, 'api')

    await expect(priya.page.getByRole('heading', { name: 'Your access to this document was removed' })).toBeVisible()
  })
})
