import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inlineScripts, insertContentSecurityPolicy, scriptSource } from './content-security-policy.ts'
import { insertFirstPaintScripts } from './first-paint.ts'
import { headScripts } from './head-scripts.ts'
import { securityHeadersCaddy } from './security-headers-caddy.ts'

// The generator fills the policy of a built page into the fixed headers of the deployment (`deploy/security-headers.caddy`,
// the real file: a test of a copy would pass while the file drifted).

const fixedHeaders = readFileSync(join(import.meta.dirname, '../../../deploy/security-headers.caddy'), 'utf8')
const page =
  '<html><head><script>first()</script><script>second()</script><script type="module" src="/a.js"></script></head></html>'
const headerValue = (snippet: string, name: string) => new RegExp(`^\\s*${name} "([^"]*)"`, 'm').exec(snippet)?.[1]
const policyLine = /^\s*Content-Security-Policy .*$/m

/** What the API sends as HSTS, read from its source: the web app cannot import the server, and the two must say the same. */
const apiStrictTransportSecurity =
  /strictTransportSecurity = '([^']*)'/.exec(
    readFileSync(join(import.meta.dirname, '../../server/src/http/security.ts'), 'utf8'),
  )?.[1] ?? ''

describe('the headers of the document for the proxy', () => {
  const snippet = securityHeadersCaddy(page, fixedHeaders)

  it('is the fixed headers with one line changed: the policy, and nothing else of theirs is lost', () => {
    const [before, after] = [fixedHeaders, snippet].map((text) => text.replace(policyLine, '').split('\n'))

    expect(after).toEqual(before)
    expect(snippet).not.toBe(fixedHeaders)
  })

  it.each(['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Cross-Origin-Opener-Policy'])(
    'keeps %s as the deployment decided',
    (name) => {
      expect(headerValue(snippet, name)).toBe(headerValue(fixedHeaders, name))
    },
  )

  it('keeps the removal of Server, which is a line of its own', () => {
    expect(snippet).toMatch(/^\s*-Server\s*$/m)
  })

  it('is one header block and no named snippet, which is the shape the Caddyfile imports', () => {
    const code = snippet.split('\n').filter((line) => !/^\s*(#|$)/.test(line))

    expect(code[0]).toBe('header {')
    expect(code.at(-1)).toBe('}')
    expect(snippet).not.toMatch(/^\s*\(/m)
  })

  it('carries the policy with the hash of every inline script of the page, and frame-ancestors, which a meta tag cannot say', () => {
    const policy = headerValue(snippet, 'Content-Security-Policy') ?? ''

    expect(policy).toContain(`script-src 'self' ${inlineScripts(page).map(scriptSource).join(' ')};`)
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-/)
  })

  it('narrows connections to the host the proxy answers on, the page’s own wss: being what the build could know', () => {
    const policy = headerValue(snippet, 'Content-Security-Policy') ?? ''

    expect(policy).toContain("connect-src 'self' wss://{hostport};")
    expect(policy).not.toMatch(/connect-src[^;]*\swss:[;\s]/)
  })

  it('says the same about HSTS as the API does, since a browser keeps the last policy it saw', () => {
    expect(headerValue(snippet, 'Strict-Transport-Security')).toBe(apiStrictTransportSecurity)
    expect(apiStrictTransportSecurity).not.toContain('includeSubDomains')
  })

  it('refuses a page with no inline script, which is a page that was not built', () => {
    expect(() => securityHeadersCaddy('<html></html>', fixedHeaders)).toThrow('was it built')
  })

  it('refuses fixed headers that have no policy to replace, instead of sending a page with none', () => {
    expect(() => securityHeadersCaddy(page, 'header {\n\tX-Content-Type-Options "nosniff"\n}\n')).toThrow(
      'no Content-Security-Policy line',
    )
  })
})

// The page as the build leaves it, made here by the same two steps the plugins do, so this runs with `npm test` and needs no
// `dist/`: the first-paint scripts in, then the policy written from the page it is in.
describe('the headers for a built page', () => {
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

  it('name the scripts of that page, and the policy is the one its <meta> carries plus what only a header can say', () => {
    const snippet = securityHeadersCaddy(built, fixedHeaders)
    const meta = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(built)?.[1] ?? ''
    const header = headerValue(snippet, 'Content-Security-Policy') ?? ''

    for (const script of inlineScripts(built)) expect(header).toContain(scriptSource(script))
    expect(header).toBe(
      `${meta.replace("connect-src 'self' wss:", "connect-src 'self' wss://{hostport}")}; frame-ancestors 'none'`,
    )
  })

  it('are what the command line prints for the file of that page and the fixed headers', () => {
    const printed = execFileSync(
      process.execPath,
      [
        join(import.meta.dirname, 'security-headers-caddy.ts'),
        join(directory, 'index.html'),
        join(import.meta.dirname, '../../../deploy/security-headers.caddy'),
      ],
      { encoding: 'utf8' },
    )

    expect(printed).toBe(securityHeadersCaddy(built, fixedHeaders))
  })
})
