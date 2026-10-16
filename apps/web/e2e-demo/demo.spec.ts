/* The static demo as GitHub Pages serves it: from `dist-demo/`, under `/draftroom/`, with no server behind it. */
import type { Page } from '@playwright/test'
import { weeklyEnglish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const basePath = '/draftroom/'
const main = (page: Page) => page.getByRole('main')

/** The deep routes a person can reload, each with what proves its screen is there. */
const deepRoutes = [
  {
    name: 'Documents',
    path: 'documents',
    ready: (page: Page) => page.getByRole('heading', { level: 1, name: 'Documents' }),
  },
  {
    name: 'a document',
    path: `documents/${weeklyEnglish.id}`,
    ready: (page: Page) => page.getByRole('textbox', { name: 'Document title' }),
  },
  { name: 'the Trash', path: 'trash', ready: (page: Page) => page.getByRole('heading', { level: 1, name: 'Trash' }) },
]

test.describe('the network', () => {
  // What it is never allowed to do is checked in every test, by the fixture; this one only proves it has something to see.
  test('is watched on the screens that ask for the most: the lists, the editor and the Trash', async ({
    page,
    networkWatch,
  }) => {
    await page.goto('')
    await page.goto('documents')
    await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible()
    await page.goto(`documents/${weeklyEnglish.id}`)
    await expect(page.getByRole('textbox', { name: 'Document title' })).toBeVisible()
    await page.goto('trash')
    await expect(page.getByRole('heading', { level: 1, name: 'Trash' })).toBeVisible()

    expect(networkWatch.length, 'the page asked for nothing, so the watch saw nothing').toBeGreaterThan(5)
  })
})

test.describe('the server of the demo', () => {
  test('answers a malformed address with 400 and keeps serving', async ({ request }) => {
    expect((await request.get('%E0%A4%A')).status()).toBe(400)
    expect((await request.get('')).status()).toBe(200)
  })
})

test.describe('a route reloaded', () => {
  for (const { name, path, ready } of deepRoutes) {
    test(`loads ${name}, which only 404.html makes possible on Pages`, async ({ page }) => {
      await page.goto(path)
      await expect(ready(page)).toBeVisible()

      await page.reload()
      await expect(ready(page)).toBeVisible()
      expect(new URL(page.url()).pathname).toBe(`${basePath}${path}`)
    })
  }
})

test('the state starts again on reload: a document that was created is gone', async ({ page }) => {
  // The explorer, where a document is created, is on the screens of a document; the share route has no editor.
  await page.goto(`documents/${weeklyEnglish.id}/share`)
  await page.getByRole('complementary', { name: 'Explorer' }).getByRole('button', { name: 'New document' }).click()
  await expect(page.getByRole('textbox', { name: 'Document title' })).toHaveValue('Untitled document')

  const created = main(page).getByRole('link', { name: 'Untitled document' })
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Documents' }).click()
  await expect(created).toHaveCount(1)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible()
  await expect(created).toHaveCount(0)
})
