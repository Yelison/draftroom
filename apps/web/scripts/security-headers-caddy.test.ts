import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inlineScripts, insertContentSecurityPolicy, scriptSource } from './content-security-policy.ts'
import { insertFirstPaintScripts } from './first-paint.ts'
import { headScripts } from './head-scripts.ts'
import { securityHeadersCaddy } from './security-headers-caddy.ts'

const page =
  '<html><head><script>first()</script><script>second()</script><script type="module" src="/a.js"></script></head></html>'
/** What the API sends as HSTS, read from its source: the web app cannot import the server, and the two must say the same. */
const apiStrictTransportSecurity =
  /strictTransportSecurity = '([^']*)'/.exec(
    readFileSync(join(import.meta.dirname, '../../server/src/http/security.ts'), 'utf8'),
  )?.[1] ?? ''
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
    expect(headerValue(snippet, 'Strict-Transport-Security')).toBe('max-age=31536000')
  })

  it('says the same about HSTS as the API does, since a browser keeps the last policy it saw', () => {
    expect(headerValue(snippet, 'Strict-Transport-Security')).toBe(apiStrictTransportSecurity)
    expect(apiStrictTransportSecurity).not.toContain('includeSubDomains')
  })

  it('refuses a page with no inline script, which is a page that was not built', () => {
    expect(() => securityHeadersCaddy('<html></html>')).toThrow('was it built')
  })
})

// The page as the build leaves it, made here by the same two steps the plugins do, so this runs with `npm test` and needs no
// `dist/`: the first-paint scripts in, then the policy written from the page it is in.
describe('the snippet of a built page', () => {
  const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')
  const built = insertContentSecurityPolicy(
    insertFirstPaintScripts(
      template.replace('</head>', '<script type="module" crossorigin src="/assets/index-abc123.js"></script></head>'),
      headScripts,
    ),
  )
  let directory: string
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'draftroom-headers-'))
    writeFileSync(join(directory, 'index.html'), built)
  })
  afterAll(() => rmSync(directory, { recursive: true, force: true }))

  it('names the scripts of that page, in the policy its <meta> carries too', () => {
    const snippet = securityHeadersCaddy(built)
    const meta = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(built)?.[1] ?? ''

    for (const script of inlineScripts(built)) expect(snippet).toContain(scriptSource(script))
    expect(headerValue(snippet, 'Content-Security-Policy')).toBe(`${meta}; frame-ancestors 'none'`)
  })

  it('is what the command line prints for the file of that page', () => {
    const printed = execFileSync(
      process.execPath,
      [join(import.meta.dirname, 'security-headers-caddy.ts'), join(directory, 'index.html')],
      { encoding: 'utf8' },
    )

    expect(printed).toBe(securityHeadersCaddy(built))
  })
})
