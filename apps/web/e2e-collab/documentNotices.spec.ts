import { storedText } from './database.ts'
import { expect, test } from './fixtures.ts'
import { restAs } from './people.ts'
import { createDocument } from './scene.ts'

// What one person's change to the document does on the screen of the other, with two browsers on the real stack: the
// REST call commits, the server tells the connections after it, and the other page changes with no reload.

const written = 'The plan is shared with Priya.'

test.describe('a document renamed while someone else has it open', () => {
  test('the other person sees the new title without reloading', async ({ join }) => {
    const documentId = await createDocument('daniel', ['priya'])
    const daniel = await join('daniel')
    const priya = await join('priya')
    await daniel.open(documentId)
    await priya.open(documentId)
    let reloads = 0
    priya.page.on('load', () => (reloads += 1))

    const title = daniel.page.getByRole('textbox', { name: 'Document title' })
    await title.fill('Winter launch plan')
    await title.press('Enter')

    await expect(priya.page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Winter launch plan')
    expect(reloads).toBe(0)
  })
})

test.describe('a document archived while someone else has it open', () => {
  test('the person who is not an owner can no longer write, at once, and nothing they type reaches the server', async ({
    join,
  }) => {
    const documentId = await createDocument('daniel', ['priya'])
    const daniel = await join('daniel')
    const priya = await join('priya')
    await daniel.open(documentId)
    await priya.open(documentId)
    await daniel.typeAtEnd(written)
    await expect(priya.syncStatus).toHaveText('Sync status: Synced')
    await expect.poll(() => storedText(documentId)).toBe(written)
    // The close of her connection is the server's answer to the archive; the browser logs the refusal of what follows.
    priya.toleratesConnectionErrors()

    await restAs('daniel').archiveDocument({ params: { path: { documentId } } })

    await expect(priya.page.getByRole('heading', { name: 'Your access to this document was removed' })).toBeVisible()
    await expect(priya.editor).toHaveCount(0)
    await priya.page.keyboard.type(' Priya keeps typing.')
    await daniel.page.waitForTimeout(1_500)
    expect(storedText(documentId)).toBe(written)
  })

  test('the owner keeps the document to read, read-only, and the copy on their device', async ({ join }) => {
    const documentId = await createDocument('daniel', ['priya'])
    const daniel = await join('daniel')
    await daniel.open(documentId)
    await daniel.typeAtEnd(written)
    await expect(daniel.syncStatus).toHaveText('Sync status: Synced')
    daniel.toleratesConnectionErrors()

    await restAs('daniel').archiveDocument({ params: { path: { documentId } } })

    await expect(daniel.syncStatus).toHaveText('Sync status: Read-only')
    await expect(daniel.editor).toHaveAttribute('contenteditable', 'false')
    await expect(daniel.page.getByRole('textbox', { name: 'Document title' })).toHaveAttribute('readonly', '')
    expect(await daniel.text()).toBe(written)
    expect(await daniel.localCopies(), 'the owner still has the document').toHaveLength(1)
  })
})
