import { expect, test as base } from '@playwright/test'

/**
 * The test every spec of this suite uses. The page it gives fails the test on anything the browser reports as an error,
 * so a request the mock does not implement (it throws and logs), an exception in a screen or a rejected promise nobody
 * handled does not slip by behind assertions that happen to pass.
 */
export const test = base.extend({
  page: async ({ page }, run) => {
    const problems: string[] = []
    page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console.error: ${message.text()}`)
    })

    await run(page)

    expect(problems, 'errors the browser reported while the test ran').toEqual([])
  },
})

export { expect }
