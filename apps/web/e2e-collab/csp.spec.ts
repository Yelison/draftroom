import { watchPolicyViolations } from '../e2e/policyViolations.ts'
import { expect, test } from './fixtures.ts'
import { createDocument } from './scene.ts'

/**
 * The production build against the real stack under its content security policy: signing in, reading the lists, opening a
 * document, typing and the collaboration socket (`connect-src`) must all work without the browser refusing anything. That
 * the policy refuses what it should is shown with the mocked suite (`e2e/csp.spec.ts`), which builds the same page.
 */
test.describe('the real app under its content security policy', () => {
  test('is refused nothing while two people write in one document', async ({ join }) => {
    const documentId = await createDocument('daniel', ['priya'])
    const daniel = await join('daniel')
    const priya = await join('priya')
    const danielViolations = await watchPolicyViolations(daniel.page)
    const priyaViolations = await watchPolicyViolations(priya.page)

    await daniel.page.goto('/documents')
    await expect(daniel.page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    // Without a policy there would be nothing to be refused by, and this test would prove nothing.
    await expect(daniel.page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      'content',
      /script-src 'self' 'sha256-[^;]*; .*connect-src 'self' wss:/,
    )
    await daniel.open(documentId)
    await priya.open(documentId)
    await daniel.typeAtEnd('Written under the policy.')
    await expect.poll(() => priya.text()).toBe('Written under the policy.')
    await expect(daniel.syncStatus).toHaveText('Sync status: Synced')

    expect(await danielViolations()).toEqual([])
    expect(await priyaViolations()).toEqual([])
  })
})
