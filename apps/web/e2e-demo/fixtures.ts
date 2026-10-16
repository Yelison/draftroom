import { expect, test as base } from '@playwright/test'

/**
 * The test every spec of this suite uses: the page it gives fails the test on anything the browser reports as an error.
 * The one exception is the line Chrome logs when a page is served with a 404 status, which is how GitHub Pages serves
 * every route of the app except the home page: it is what `404.html` is for, and it is not an error of the app. A
 * resource of the build that is missing is a 404 too, and that one still fails the test.
 */
export const test = base.extend({
  page: async ({ page }, run) => {
    const problems: string[] = []
    page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const servedAsNotFound = /status of 404/.test(message.text()) && !message.location().url.includes('/assets/')
      if (!servedAsNotFound) problems.push(`console.error: ${message.text()}`)
    })

    await run(page)

    expect(problems, 'errors the browser reported while the test ran').toEqual([])
  },
})

export { expect }
