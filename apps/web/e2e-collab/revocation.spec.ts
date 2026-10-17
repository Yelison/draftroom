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
 * way, so the test decides it: it holds back the API's answer to see the connection's refusal alone, or holds back the
 * connection until the API has answered.
 */
async function accessRemovedDuringTheOutage(join: (person: DemoPerson) => Promise<Participant>, first: FirstAnswer) {
  const documentId = await createDocument('daniel', ['priya'])
  const daniel = await join('daniel')
  const priya = await join('priya')
  priya.toleratesConnectionErrors()
  // Only where the order is the test's: the connections are then made by the test's control and not by the browser.
  const collaboration = first === 'api' ? await priya.controlCollaboration() : undefined
  await daniel.open(documentId)
  await priya.open(documentId)
  await daniel.typeAtEnd(shared)
  await expect.poll(() => priya.text()).toBe(shared)

  await priya.context.setOffline(true)
  collaboration?.setReachable(false)
  await expect(priya.syncStatus).toHaveText('Sync status: Offline with local copy')
  // The cut reaches the server's side too: it no longer sees her, so there is no live connection of hers for it to revoke.
  await expect(daniel.presenceOf('Priya Raman')).toBeHidden()
  await priya.typeAtEnd(offlineText)
  await expect(priya.syncStatus).toHaveText('Sync status: Offline with local copy')
  expect(await priya.localCopies(), 'her device keeps what she wrote').toHaveLength(1)

  await revokeAccess('daniel', documentId, 'priya')
  const isTheDocument = (url: URL) => url.pathname === `/api/documents/${documentId}`
  if (first === 'collaboration-server') {
    // A request that is never answered: the document the screen already has stays on it until the connection says more.
    await priya.page.route(isTheDocument, () => new Promise<void>(() => {}))
    await priya.context.setOffline(false)
  } else {
    // The connection is not made until the API has refused: the 404 is what the screen sees first, every time.
    const refusedByTheApi = priya.page.waitForResponse(
      (response) => isTheDocument(new URL(response.url())) && response.status() === 404,
    )
    collaboration?.hold()
    collaboration?.setReachable(true)
    await priya.context.setOffline(false)
    await refusedByTheApi
    // The answer has reached the page; the screen still has to take it in, and the connection is released only after it has:
    // what the screen says of it (the removal of access, or that the document is not available) is the sign that it did.
    await priya.page
      .getByRole('heading', { name: /Your access to this document was removed|This document isn't available/ })
      .waitFor()
    collaboration?.release()
  }
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

test.describe('access removed while the person was offline, when the API refuses her first', () => {
  test('what they wrote offline never reaches the server', async ({ join }) => {
    const { documentId, daniel, priya } = await accessRemovedDuringTheOutage(join, 'api')

    await expect(priya.page.getByRole('heading', { name: 'Your access to this document was removed' })).toBeVisible()
    // The connection was let through after the API's refusal: it has had the time to send what she wrote, if it could.
    await priya.page.waitForTimeout(3 * RECONNECT_INITIAL_DELAY_MS)
    await daniel.typeAtEnd(' Daniel carries on.')
    await expect(daniel.syncStatus).toHaveText('Sync status: Synced')
    await expect.poll(() => storedText(documentId)).toBe(`${shared} Daniel carries on.`)
    expect(await daniel.text()).toBe(`${shared} Daniel carries on.`)
  })

  test('their offline copy is purged from the device', async ({ join }) => {
    const { priya } = await accessRemovedDuringTheOutage(join, 'api')

    await expect.poll(() => priya.localCopies(), { timeout: 15_000 }).toEqual([])
  })

  test('their screen says that the access was removed', async ({ join }) => {
    const { priya } = await accessRemovedDuringTheOutage(join, 'api')

    await expect(priya.page.getByRole('heading', { name: 'Your access to this document was removed' })).toBeVisible()
    await expect(priya.page.getByRole('link', { name: 'Go to Documents' })).toBeVisible()
  })
})

test.describe('access removed while the page was closed, when the document is opened cold', () => {
  test('says the document is not available, never mounts the editor, and purges the copy on the device', async ({
    join,
  }) => {
    const documentId = await createDocument('daniel', ['priya'])
    const priya = await join('priya')
    // The 404 she is about to get is logged by the browser as a failed resource: it is the point of the test.
    priya.toleratesConnectionErrors()
    await priya.open(documentId)
    await priya.typeAtEnd(shared)
    await expect(priya.syncStatus).toHaveText('Sync status: Synced')
    expect(await priya.localCopies(), 'her device keeps the document she opened').toHaveLength(1)
    // The tab is left: no session of hers is alive to be told anything when her access goes.
    await priya.page.goto('/documents')
    await revokeAccess('daniel', documentId, 'priya')

    await priya.page.goto(`/documents/${documentId}`)

    await expect(priya.page.getByRole('heading', { name: "This document isn't available" })).toBeVisible()
    await expect.poll(() => priya.localCopies()).toEqual([])
    await expect(priya.editor).toHaveCount(0)
    await expect(priya.syncStatus).toHaveCount(0)
  })
})
