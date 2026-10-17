import { expect, type Page } from '@playwright/test'

/**
 * Starts listening for the browser's own report that the page's content security policy refused something, before the
 * scripts of the page run: a violation that happened while the page loaded is the one that would otherwise be missed.
 * (The init script is injected by the browser's tooling, which the policy does not apply to.) Returns what to call to read them.
 */
export async function watchPolicyViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const violations: string[] = []
    Object.assign(window, { policyViolations: violations })
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(
        `${event.violatedDirective}: ${event.blockedURI || 'inline'} (${event.sourceFile}:${event.lineNumber})`,
      )
    })
  })
  return () => page.evaluate((): string[] => Reflect.get(window, 'policyViolations') ?? [])
}

/**
 * Shows that the watch can see: the page really carries a policy, and a script written into it from the outside, which is
 * what an injection looks like, is refused and reported and does not run. A test that only found no violations would also
 * pass if there were no policy to violate.
 */
export async function expectPolicyInEffect(page: Page, violations: () => Promise<string[]>): Promise<void> {
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(policy, 'the page carries a content security policy').toContain("script-src 'self' 'sha256-")
  const scriptSources = /script-src ([^;]*)/.exec(policy ?? '')?.[1] ?? ''
  expect(scriptSources).not.toContain('unsafe')

  const before = (await violations()).length
  const ran = await page.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'window.injectedScriptRan = true'
    document.head.append(script)
    return Reflect.get(window, 'injectedScriptRan') === true
  })

  expect(ran, 'an injected inline script ran').toBe(false)
  await expect.poll(async () => (await violations()).length).toBe(before + 1)
  expect((await violations()).at(-1)).toContain('script-src-elem')
}
