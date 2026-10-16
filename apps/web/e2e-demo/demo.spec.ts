/* The static demo as GitHub Pages serves it: from `dist-demo/`, under `/draftroom/`, with no server behind it. */
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { weeklyEnglish } from '../src/data/mock/fixtures/documents.ts'
import { expect, test } from './fixtures.ts'

test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 800 } })

const basePath = '/draftroom/'
const buildDirectory = resolve(import.meta.dirname, '..', 'dist-demo')
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
  test('is never reached: the page asks only for files of the build and opens no WebSocket', async ({
    page,
    baseURL,
  }) => {
    const files = new Set(
      readdirSync(buildDirectory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => `${basePath}${`${entry.parentPath}/${entry.name}`.slice(buildDirectory.length + 1)}`),
    )
    const origin = new URL(baseURL ?? '').origin
    const seen: string[] = []
    const notAllowed: string[] = []
    const webSockets: string[] = []

    // Whatever is not the build's own is aborted, so a request that should not happen cannot reach anything either.
    await page.context().route('**/*', async (route) => {
      const request = route.request()
      const { origin: requestOrigin, pathname } = new URL(request.url())
      seen.push(`${request.method()} ${request.url()}`)
      const isTheBuild = requestOrigin === origin && (files.has(pathname) || request.isNavigationRequest())
      if (isTheBuild && pathname.startsWith(basePath)) return route.continue()
      notAllowed.push(`${request.method()} ${request.url()}`)
      return route.abort()
    })
    page.on('websocket', (webSocket) => webSockets.push(webSocket.url()))

    // The screens that ask for the most: the lists, the editor with its own chunk, and the Trash. The waits are soft so
    // that a screen that never comes, because its request was refused, still ends in the list of what was refused.
    await page.goto('')
    await page.goto('documents')
    await expect.soft(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible()
    await page.goto(`documents/${weeklyEnglish.id}`)
    await expect.soft(page.getByRole('textbox', { name: 'Document title' })).toBeVisible()
    await page.goto('trash')
    await expect.soft(page.getByRole('heading', { level: 1, name: 'Trash' })).toBeVisible()

    await test.info().attach('requests.txt', { body: seen.join('\n') })
    expect(seen.length, 'the page asked for nothing, so the check saw nothing').toBeGreaterThan(5)
    expect(notAllowed, 'requests outside the build').toEqual([])
    expect(webSockets, 'WebSockets').toEqual([])
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
