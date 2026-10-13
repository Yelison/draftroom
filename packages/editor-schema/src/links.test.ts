import { describe, expect, it } from 'vitest'
import { isAllowedLinkHref } from './links.ts'

describe('isAllowedLinkHref', () => {
  const allowed = [
    ['an https address', 'https://example.com/path?query=1#part'],
    ['an http address', 'http://example.com'],
    ['a mail address', 'mailto:ana@example.com'],
    ['the scheme in capitals', 'HTTPS://EXAMPLE.COM'],
    ['spaces around the address, which the URL parser drops', '  https://example.com  '],
  ] as const

  const refused = [
    ['javascript:', 'javascript:alert(1)'],
    ['javascript: in mixed case', 'JaVaScRiPt:alert(1)'],
    ['javascript: after a space', ' javascript:alert(1)'],
    ['javascript: split by a tab', 'java\tscript:alert(1)'],
    ['javascript: split by a newline', 'java\nscript:alert(1)'],
    ['javascript: after a control character', '\u0001javascript:alert(1)'],
    ['javascript: after a no-break space', ' javascript:alert(1)'],
    ['an entity in place of a letter', '&#106;avascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['file:', 'file:///etc/passwd'],
    ['ftp:', 'ftp://example.com/file'],
    ['tel:', 'tel:+34600000000'],
    ['a path with no origin', '/documents/abc'],
    ['an address with no scheme', '//evil.example/path'],
    ['a bare domain', 'example.com'],
    ['a fragment', '#section'],
    ['an empty string', ''],
    ['only spaces', '   '],
    ['null', null],
    ['undefined', undefined],
  ] as const

  it.each(allowed)('allows %s', (_name, href) => {
    expect(isAllowedLinkHref(href)).toBe(true)
  })

  it.each(refused)('refuses %s', (_name, href) => {
    expect(isAllowedLinkHref(href)).toBe(false)
  })
})
