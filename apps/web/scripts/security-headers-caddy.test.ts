import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inlineScripts, scriptSource } from './content-security-policy.ts'
import { securityHeadersCaddy } from './security-headers-caddy.ts'

const page =
  '<html><head><script>first()</script><script>second()</script><script type="module" src="/a.js"></script></head></html>'
const headerValue = (snippet: string, name: string) => new RegExp(`${name} "([^"]*)"`).exec(snippet)?.[1]

describe('the Caddy snippet of security headers', () => {
  const snippet = securityHeadersCaddy(page)

  it('carries the policy with the hash of every inline script of the page, and frame-ancestors, which a meta tag cannot say', () => {
    const policy = headerValue(snippet, 'Content-Security-Policy') ?? ''

    expect(policy).toContain(`script-src 'self' ${inlineScripts(page).map(scriptSource).join(' ')};`)
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-/)
  })

  it('carries the other headers of a document behind HTTPS', () => {
    expect(headerValue(snippet, 'X-Content-Type-Options')).toBe('nosniff')
    expect(headerValue(snippet, 'Referrer-Policy')).toBe('no-referrer')
    expect(headerValue(snippet, 'Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
  })

  it('refuses a page with no inline script, which is a page that was not built', () => {
    expect(() => securityHeadersCaddy('<html></html>')).toThrow('was it built')
  })
})

// The built page is the one `vite build` leaves in `dist/` (the mocked end-to-end suite builds it before this runs in CI; a
// checkout that has not built it skips this): the hashes in the snippet are the hashes of that page.
describe.skipIf(!existsSync(join(import.meta.dirname, '../dist/index.html')))('the snippet of the built page', () => {
  it('names the scripts of dist/index.html, which the command line prints the same', () => {
    const file = join(import.meta.dirname, '../dist/index.html')
    const built = readFileSync(file, 'utf8')

    const printed = execFileSync(process.execPath, [join(import.meta.dirname, 'security-headers-caddy.ts'), file], {
      encoding: 'utf8',
    })

    expect(printed).toBe(securityHeadersCaddy(built))
    for (const script of inlineScripts(built)) expect(printed).toContain(scriptSource(script))
  })
})
