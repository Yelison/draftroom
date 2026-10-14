import { describe, expect, it } from 'vitest'
import { linkAddressFrom } from './linkAddress.ts'

describe('linkAddressFrom', () => {
  const accepted = [
    ['a web address', 'https://example.com/page?query=1#part', 'https://example.com/page?query=1#part'],
    ['an http address', 'http://example.com', 'http://example.com'],
    ['the scheme in capitals', 'HTTPS://EXAMPLE.COM', 'HTTPS://EXAMPLE.COM'],
    ['spaces around it', '  https://example.com  ', 'https://example.com'],
    ['a bare domain, read as https', 'example.com', 'https://example.com'],
    ['a domain with a path', 'example.com/docs/intro', 'https://example.com/docs/intro'],
    ['a domain with a port, which is not a scheme', 'example.com:8080/path', 'https://example.com:8080/path'],
    ['an email address, read as a mail link', 'ana@example.com', 'mailto:ana@example.com'],
    ['a mail link', 'mailto:ana@example.com', 'mailto:ana@example.com'],
  ] as const

  const refused = [
    ['nothing', ''],
    ['only spaces', '   '],
    ['javascript:', 'javascript:alert(1)'],
    ['javascript: in mixed case', 'JaVaScRiPt:alert(1)'],
    ['javascript: after spaces', '   javascript:alert(1)'],
    ['javascript: split by a tab', 'java\tscript:alert(1)'],
    ['two words, which are no address', 'read this'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['file:', 'file:///etc/passwd'],
    ['ftp:', 'ftp://example.com/file'],
    ['tel:', 'tel:+34600000000'],
  ] as const

  it.each(accepted)('accepts %s', (_name, typed, stored) => {
    expect(linkAddressFrom(typed)).toBe(stored)
  })

  it.each(refused)('refuses %s', (_name, typed) => {
    expect(linkAddressFrom(typed)).toBeNull()
  })
})
