import type { Page } from '@playwright/test'
import { environment } from './environment.ts'
import { expect, Participant, test } from './fixtures.ts'
import { demoPassword, people, restAs } from './people.ts'
import { createDocument } from './scene.ts'
import { person } from './accountMenu.ts'

const lucia = 'lucia.fernandez@almazara.example'

async function signInThroughTheScreen(page: Page, email: string) {
  await page.goto('/sign-in')
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByLabel('Password').fill(demoPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/**
 * A browser has one session and many tabs. One tab signs in as somebody else and asks what to do with the changes the old
 * account never stored; the question can wait for as long as the person likes, and the session is the new person's from the
 * start. A tab of the old account that is not in an editor has no socket to be told by: it has to hear of the change from the
 * account that is written down, or what it asks next is answered as the new person and taken for the loss of the document.
 */
test.describe('a change of account in one tab of the browser', () => {
  test('is heard by the others at once, and the copy of the account that was left is still there when the person keeps it', async ({
    browser,
  }) => {
    const documentId = await createDocument('daniel', [])
    // Only his copies are counted: a copy of Lucía's would be no proof that his is still there.
    const { id: danielId } = await restAs('daniel').getMe()
    const context = await browser.newContext({ baseURL: environment.appOrigin, locale: 'en-US', colorScheme: 'light' })
    const first = await context.newPage()
    const daniel = new Participant('daniel', context, first)
    daniel.toleratesConnectionErrors()
    await signInThroughTheScreen(first, people.daniel)
    await expect(person(first)).toBeVisible()

    // Daniel writes with the collaboration connection cut, so that what he wrote is on this device and nowhere else, and goes
    // back to Home without reloading: the page keeps believing it is Daniel's.
    const collaboration = await daniel.controlCollaboration()
    await daniel.open(documentId)
    collaboration.setReachable(false)
    await expect(daniel.syncStatus).not.toHaveText('Sync status: Synced')
    await daniel.typeAtEnd('Written while the connection was cut.')
    await expect.poll(() => daniel.localCopies(danielId)).toHaveLength(1)
    await first.getByRole('link', { name: 'Home' }).click()
    await expect(first.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()

    // Another tab signs in as Lucía, who is in another workspace. The question about Daniel's changes is left unanswered.
    const second = await context.newPage()
    await signInThroughTheScreen(second, lucia)
    const question = second.getByRole('dialog')
    await expect(question).toContainText('1 document has changes that were never stored', { timeout: 20_000 })

    // The first tab goes back to the document while the question is open. It has been told who is signed in: nothing is asked
    // as Lucía for Daniel's document, and the copy he made is not taken for one that was lost.
    await first.goBack()
    // Exactly the document that is not there for the new account: the screen of an access that was removed, which is what the
    // old account's copy being purged would show, is not it.
    await expect(first.getByRole('heading', { level: 1 })).toHaveText("This document isn't available")
    expect(
      await daniel.localCopies(danielId),
      'the copy of the account that was left is still on the device',
    ).toHaveLength(1)

    await question.getByRole('button', { name: 'Keep them' }).click()
    await expect(second).toHaveURL(/\/$/)
    expect(await daniel.localCopies(danielId), 'and after the person chose to keep it').toHaveLength(1)
    await context.close()
  })
})
