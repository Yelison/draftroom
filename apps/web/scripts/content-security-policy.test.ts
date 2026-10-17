import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { insertFirstPaintScripts } from './first-paint.ts'
import {
  contentSecurityPolicy,
  inlineScripts,
  insertContentSecurityPolicy,
  scriptSource,
} from './content-security-policy.ts'
import { headScripts } from './head-scripts.ts'

const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')
/** The page as the build leaves it: the first-paint scripts in, and the app module Vite adds. */
const built = insertFirstPaintScripts(
  template.replace('</head>', '<script type="module" crossorigin src="/assets/index-abc123.js"></script></head>'),
  headScripts,
)

const directive = (policy: string, name: string): string[] =>
  policy
    .split('; ')
    .find((entry) => entry.startsWith(`${name} `))
    ?.split(' ')
    .slice(1) ?? []

describe('the inline scripts of a page', () => {
  it('are the ones with no src, in order, with their exact text', () => {
    expect(
      inlineScripts('<script>one()</script><script src="/a.js"></script><script type="module">two()</script>'),
    ).toEqual(['one()', 'two()'])
  })

  it('are the first-paint scripts of the built page and not the app module', () => {
    expect(inlineScripts(built)).toEqual(headScripts)
  })
})

describe('the policy of the built page', () => {
  const policy = contentSecurityPolicy(inlineScripts(built).map(scriptSource))

  it('names each inline script by the SHA-256 of its text, which the browser computes the same way', () => {
    const expected = headScripts.map(
      (source) => `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`,
    )

    expect(directive(policy, 'script-src')).toEqual(["'self'", ...expected])
  })

  it('lets no script run by being inline, and none by eval', () => {
    for (const name of ['script-src', 'default-src']) {
      expect(directive(policy, name)).not.toContain("'unsafe-inline'")
      expect(directive(policy, name)).not.toContain("'unsafe-eval'")
    }
  })

  it('allows nothing it does not name, and no plugin, base address or foreign form', () => {
    expect(directive(policy, 'default-src')).toEqual(["'none'"])
    expect(directive(policy, 'object-src')).toEqual(["'none'"])
    expect(directive(policy, 'base-uri')).toEqual(["'none'"])
    expect(directive(policy, 'form-action')).toEqual(["'self'"])
    expect(directive(policy, 'frame-src')).toEqual(["'none'"])
  })

  it('connects to its own origin, for REST and the collaboration socket, and to no other host by name', () => {
    expect(directive(policy, 'connect-src')).toEqual(["'self'", 'wss:'])
  })

  it('cannot say frame-ancestors, which a meta tag ignores: the proxy does', () => {
    expect(policy).not.toContain('frame-ancestors')
  })
})

describe('the page with its policy', () => {
  const page = insertContentSecurityPolicy(built)
  const policyOf = (html: string) => /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1]

  it('carries the policy right after the encoding, before any script it has to govern', () => {
    expect(page.indexOf('charset')).toBeLessThan(page.indexOf('Content-Security-Policy'))
    expect(page.indexOf('Content-Security-Policy')).toBeLessThan(page.indexOf('<script'))
    expect(page.indexOf('Content-Security-Policy')).toBeLessThan(1024)
  })

  it('names exactly the inline scripts of the page it is in', () => {
    const hashes = (policyOf(page) ?? '').match(/'sha256-[^']+'/g)

    expect(hashes).toEqual(inlineScripts(page).map(scriptSource))
  })

  it('follows a change to a script: a character more and the old hash is gone', () => {
    const changed = built.replace(headScripts[0] ?? '', `${headScripts[0] ?? ''};`)

    expect(policyOf(insertContentSecurityPolicy(changed))).not.toBe(policyOf(page))
  })

  it('refuses a page it cannot place the policy in', () => {
    expect(() => insertContentSecurityPolicy('<html><head></head></html>')).toThrow('exactly one charset meta')
  })
})
