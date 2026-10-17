import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test as base, type Page } from '@playwright/test'

const basePath = '/draftroom/'
const buildDirectory = resolve(import.meta.dirname, '..', 'dist-demo')

/** The paths of the files of the build, as the browser asks for them. */
const buildPaths = new Set(
  readdirSync(buildDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${basePath}${`${entry.parentPath}/${entry.name}`.slice(buildDirectory.length + 1)}`),
)

/** Runs `watch` on a page and on every page the test opens in its context afterwards: a second tab is as watched as the first. */
function onEveryPage(page: Page, watch: (watched: Page) => void) {
  watch(page)
  page.context().on('page', watch)
}

/**
 * The test every spec of this suite uses. It fails on anything the browser reports as an error, and it watches the
 * network in every test, not in one: the demo is static, so a request that does not ask for a file of the build, or
 * that the build does not have, or any WebSocket, fails the test that caused it. What is not the build's own is aborted,
 * so it cannot reach anything either.
 *
 * The only 404 that is not a failure is the one of a route of the app, which is how GitHub Pages serves `404.html` for
 * every path that is not a file; it is what `404.html` is for. Chrome logs that status as an error too, so the
 * `console.error` of that line is let through, and a missing resource of the build is not.
 */
export const test = base.extend<{ networkWatch: string[] }>({
  page: async ({ page }, run) => {
    const problems: string[] = []
    onEveryPage(page, (watched) => {
      watched.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`))
      watched.on('console', (message) => {
        if (message.type() !== 'error') return
        const servedAsNotFound = /status of 404/.test(message.text()) && !message.location().url.includes('/assets/')
        if (!servedAsNotFound) problems.push(`console.error: ${message.text()}`)
      })
    })

    await run(page)

    expect(problems, 'errors the browser reported while the test ran').toEqual([])
  },

  // The fixture hands the test the list of the requests it made, for a test that has to know the page asked for something.
  networkWatch: [
    async ({ page, baseURL }, run, testInfo) => {
      const origin = new URL(baseURL ?? '').origin
      const requests: string[] = []
      const refused: string[] = []
      const missing: string[] = []
      const webSockets: string[] = []

      await page.context().route('**/*', async (route) => {
        const request = route.request()
        const { origin: requestOrigin, pathname } = new URL(request.url())
        requests.push(`${request.method()} ${request.url()}`)
        const isTheBuild =
          requestOrigin === origin &&
          pathname.startsWith(basePath) &&
          (buildPaths.has(pathname) || request.isNavigationRequest())
        if (isTheBuild) return route.continue()
        refused.push(`${request.method()} ${request.url()}`)
        return route.abort()
      })
      onEveryPage(page, (watched) => {
        watched.on('response', (response) => {
          const request = response.request()
          if (response.status() === 404 && !request.isNavigationRequest()) missing.push(request.url())
        })
        watched.on('websocket', (webSocket) => webSockets.push(webSocket.url()))
      })

      await run(requests)

      await testInfo.attach('requests.txt', { body: requests.join('\n') })
      expect(refused, 'requests outside the build').toEqual([])
      expect(missing, 'files the build does not have').toEqual([])
      expect(webSockets, 'WebSockets').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
