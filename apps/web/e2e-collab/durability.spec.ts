import { STORED_ACK_TIMEOUT_MS } from '@draftroom/contract/collab'
import { storedText } from './database.ts'
import { expect, test } from './fixtures.ts'
import { createDocument } from './scene.ts'

test.describe('what "Synced" promises', () => {
  test('is kept by a server that was killed the moment it said so: a new browser reads the text from the database', async ({
    join,
    server,
  }) => {
    const documentId = await createDocument('daniel', ['priya'])
    const daniel = await join('daniel')
    daniel.toleratesConnectionErrors()
    await daniel.open(documentId)
    await daniel.typeAtEnd('The budget was approved on Monday.')
    await expect(daniel.syncStatus).toHaveText('Sync status: Synced')

    // `SIGKILL` leaves the server no time to store what it holds in memory: only what was stored before "Synced" is left.
    await server.restart('SIGKILL')

    const priya = await join('priya')
    await priya.open(documentId)
    await expect.poll(() => priya.text()).toBe('The budget was approved on Monday.')
    expect(storedText(documentId)).toBe('The budget was approved on Monday.')
  })

  test('is never said while the server is stopped, and is said again, truthfully, once it is back', async ({
    join,
    server,
  }) => {
    const documentId = await createDocument('daniel', [])
    const daniel = await join('daniel')
    daniel.toleratesConnectionErrors()
    await daniel.open(documentId)
    await daniel.typeAtEnd('Written with the server up.')
    await expect(daniel.syncStatus).toHaveText('Sync status: Synced')
    await daniel.recordSyncStates()

    await server.stop('SIGKILL')
    await expect(daniel.syncStatus).not.toHaveText('Sync status: Synced')
    const seenBeforeStop = (await daniel.recordedSyncStates()).length
    await daniel.typeAtEnd(' Written with the server away.')
    // Longer than the client waits for a `stored` that never comes: a label that gave in to a timeout would show by then.
    await daniel.page.waitForTimeout(STORED_ACK_TIMEOUT_MS + 5_000)

    const seenWhileStopped = (await daniel.recordedSyncStates()).slice(seenBeforeStop - 1)
    expect(seenWhileStopped).not.toContain('Sync status: Synced')
    await expect(daniel.syncStatus).not.toHaveText('Sync status: Synced')
    expect(storedText(documentId)).toBe('Written with the server up.')

    await server.start()

    await expect(daniel.syncStatus).toHaveText('Sync status: Synced', { timeout: 60_000 })
    await expect.poll(() => storedText(documentId)).toBe('Written with the server up. Written with the server away.')
  })
})
