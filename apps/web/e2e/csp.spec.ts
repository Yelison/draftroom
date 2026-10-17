import { test as unwatched } from '@playwright/test'
import { launchPlan } from '../src/data/mock/fixtures/documents.ts'
import { expectPolicyInEffect, watchPolicyViolations } from './policyViolations.ts'
import { expect, test } from './fixtures.ts'

/**
 * The app under its content security policy, in the production build with the mock data source: the screens a person uses
 * must run without the browser refusing anything (a stylesheet, a font, an inline script, a connection). The policy is the
 * one written into `index.html` by the build (`scripts/content-security-policy.ts`).
 */
test.use({ locale: 'en-US', colorScheme: 'light' })

test.describe('the page under its content security policy', () => {
  test('is refused nothing while a person works in it, in either theme', async ({ page }) => {
    const violations = await watchPolicyViolations(page)

    await page.goto('/documents')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await page.goto(`/documents/${launchPlan.id}`)
    const text = page.getByRole('textbox', { name: 'Document content' })
    await text.click()
    await page.keyboard.type('Written under the policy')
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('ControlOrMeta+B')
    await page.goto('/settings/appearance')
    await page.getByRole('radio', { name: 'Dark' }).check()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    expect(await violations()).toEqual([])
  })

  // The browser logs the refusal as an error, which is what the page of this suite fails a test for: here it is the point.
  unwatched('refuses a script that is written into it, which is the point of having one', async ({ page }) => {
    const violations = await watchPolicyViolations(page)
    await page.goto('/documents')

    await expectPolicyInEffect(page, violations)
  })
})
