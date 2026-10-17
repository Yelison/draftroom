import { request as playwrightRequest } from '@playwright/test'
import { environment } from './environment.ts'
import { expect, test } from './fixtures.ts'
import { demoPassword, people } from './people.ts'
import { createDocument } from './scene.ts'

/**
 * The screens of sign-in, sign-up and sign-out against the real server: what the mocked suite shows with a mock, shown
 * with the session the server really starts and ends. A context here has no session until the test signs it in.
 */
test.describe('signing in and out of the real stack', () => {
  test('sends a person with no session to sign in, and brings them back to the page they were going to', async ({
    browser,
  }) => {
    const documentId = await createDocument('daniel', [])
    const context = await browser.newContext({ baseURL: environment.appOrigin, locale: 'en-US', colorScheme: 'light' })
    const page = await context.newPage()

    await page.goto(`/documents/${documentId}`)
    await expect(page).toHaveURL(/\/sign-in$/)
    await page.getByRole('textbox', { name: 'Email' }).fill(people.daniel)
    await page.getByLabel('Password').fill(demoPassword)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(new RegExp(`/documents/${documentId}$`))
    await expect(page.getByRole('textbox', { name: 'Document content' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: /^Sync status/ })).toHaveText('Sync status: Synced')
    await context.close()
  })

  test('ends the session when the person signs out, and the server closes a live socket of that session in another tab', async ({
    browser,
  }) => {
    const documentId = await createDocument('daniel', [])
    const context = await browser.newContext({ baseURL: environment.appOrigin, locale: 'en-US', colorScheme: 'light' })
    const signedOutTab = await context.newPage()
    await signedOutTab.goto('/sign-in')
    await signedOutTab.getByRole('textbox', { name: 'Email' }).fill(people.daniel)
    await signedOutTab.getByLabel('Password').fill(demoPassword)
    await signedOutTab.getByRole('button', { name: 'Sign in' }).click()
    await expect(signedOutTab.getByRole('button', { name: 'Sign out' })).toBeVisible()
    const token = (await context.cookies()).find((cookie) => cookie.name === 'dr_session')?.value
    expect(token).toBeDefined()

    // The editor stays where it is in the other tab, so nothing but the server can end its socket.
    const editorTab = await context.newPage()
    const closedSockets: string[] = []
    editorTab.on('websocket', (socket) => socket.on('close', () => closedSockets.push(socket.url())))
    await editorTab.goto(`/documents/${documentId}`)
    await expect(editorTab.getByRole('status').filter({ hasText: /^Sync status/ })).toHaveText('Sync status: Synced')
    expect(closedSockets).toEqual([])

    await signedOutTab.getByRole('button', { name: 'Sign out' }).click()

    await expect(signedOutTab).toHaveURL(/\/sign-in$/)
    await expect.poll(() => closedSockets.length, 'the server closed the live collaboration socket').toBeGreaterThan(0)
    // What the browser held is worth nothing now: the session is gone from the server, not only from the page.
    const replay = await playwrightRequest.newContext({
      baseURL: environment.appOrigin,
      extraHTTPHeaders: { cookie: `dr_session=${token}` },
    })
    expect((await replay.get('/api/me')).status()).toBe(401)
    await Promise.all([replay.dispose(), context.close()])
  })

  test('says the email or the password is not right, in the same words for an account that does not exist', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: environment.appOrigin, locale: 'en-US' })
    const page = await context.newPage()
    await page.goto('/sign-in')

    const attempt = async (email: string) => {
      await page.getByRole('textbox', { name: 'Email' }).fill(email)
      await page.getByLabel('Password').fill('not the password at all')
      await page.getByRole('button', { name: 'Sign in' }).click()
      return page.getByRole('alert').textContent()
    }
    const forWrongPassword = await attempt(people.daniel)
    const forUnknownAccount = await attempt('nobody@harborpine.example')

    expect(forWrongPassword).toBe('The email or the password is not right. Check them and try again.')
    expect(forUnknownAccount).toBe(forWrongPassword)
    await context.close()
  })

  test('creates an account from the sign-up screen and leaves the person signed in', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: environment.appOrigin, locale: 'en-US' })
    const page = await context.newPage()
    const email = `new-${crypto.randomUUID()}@harborpine.example`
    await page.goto('/sign-up')

    await page.getByRole('textbox', { name: 'Name' }).fill('Lena Fischer')
    await page.getByRole('textbox', { name: 'Email' }).fill(email)
    await page.getByLabel('Password').fill('a phrase of several words')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    const me = await context.request.get('/api/me')
    expect(await me.json()).toMatchObject({ email, name: 'Lena Fischer' })
    await context.close()
  })
})
