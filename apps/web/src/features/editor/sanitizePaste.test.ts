import { describe, expect, it } from 'vitest'
import { sanitizePastedHtml } from './sanitizePaste.ts'

/** What the sanitizer leaves of pasted HTML, as the HTML the editor will read. */
const cases = [
  // Code that would run, and things that would load.
  ['a script', '<p>Hi</p><script>alert(1)</script>', '<p>Hi</p>'],
  ['an inline handler', '<p onclick="alert(1)">Hi</p>', '<p>Hi</p>'],
  [
    'a handler on a link',
    '<a href="https://example.com" onmouseover="alert(1)">x</a>',
    '<a href="https://example.com">x</a>',
  ],
  ['an image that fails to load', '<p>a</p><img src="x" onerror="alert(1)">', '<p>a</p>'],
  ['an iframe', '<iframe src="https://evil.example"></iframe><p>ok</p>', '<p>ok</p>'],
  ['an object and an embed', '<object data="x.swf"></object><embed src="x.swf"><p>ok</p>', '<p>ok</p>'],
  ['an SVG with a script inside', '<p>a</p><svg><script>alert(1)</script></svg>', '<p>a</p>'],
  ['a form', '<form action="javascript:alert(1)"><input name="a"></form><p>ok</p>', '<p>ok</p>'],
  ['a stylesheet link', '<link rel="stylesheet" href="https://evil.example/a.css"><p>ok</p>', '<p>ok</p>'],
  ['a meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example"><p>ok</p>', '<p>ok</p>'],
  ['a base address', '<base href="https://evil.example/"><p>ok</p>', '<p>ok</p>'],
  // Presentation.
  ['a style attribute', '<p style="color: red; position: fixed">styled</p>', '<p>styled</p>'],
  ['a style element', '<style>p { display: none }</style><p>text</p>', '<p>text</p>'],
  ['a class and an id', '<p class="a" id="b">text</p>', '<p>text</p>'],
  ['a data attribute', '<p data-x="1">text</p>', '<p>text</p>'],
  [
    'a handler deep inside',
    '<div><ul><li><p onmouseover="x()">a</p></li></ul></div>',
    '<div><ul><li><p>a</p></li></ul></div>',
  ],
  // Addresses.
  ['a javascript: address', '<a href="javascript:alert(1)">click</a>', '<a>click</a>'],
  ['a javascript: address in mixed case', '<a href="JaVaScRiPt:alert(1)">click</a>', '<a>click</a>'],
  ['a javascript: address after a space', '<a href=" javascript:alert(1)">click</a>', '<a>click</a>'],
  ['a javascript: address split by an entity tab', '<a href="java&#9;script:alert(1)">click</a>', '<a>click</a>'],
  ['a javascript: address with an entity for a letter', '<a href="&#106;avascript:alert(1)">click</a>', '<a>click</a>'],
  ['a data: address', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">click</a>', '<a>click</a>'],
  ['a vbscript: address', '<a href="vbscript:msgbox(1)">click</a>', '<a>click</a>'],
  ['a relative address', '<a href="/documents/other">click</a>', '<a>click</a>'],
  ['an address with no scheme', '<a href="//evil.example/path">click</a>', '<a>click</a>'],
  [
    'a target, a rel and a class on a link',
    '<a href="https://example.com" target="_top" rel="opener" class="x">l</a>',
    '<a href="https://example.com">l</a>',
  ],
  // What stays.
  ['an https address', '<a href="https://example.com/a?b=1#c">l</a>', '<a href="https://example.com/a?b=1#c">l</a>'],
  ['an http address in capitals', '<a href="HTTP://EXAMPLE.COM">l</a>', '<a href="HTTP://EXAMPLE.COM">l</a>'],
  ['a mail address', '<a href="mailto:ana@example.com">l</a>', '<a href="mailto:ana@example.com">l</a>'],
  ['the start of a numbered list', '<ol start="3"><li>x</li></ol>', '<ol start="3"><li>x</li></ol>'],
  ["the editor's own mark on what it copied", '<p data-pm-slice="1 1 []">x</p>', '<p data-pm-slice="1 1 []">x</p>'],
  [
    'every kind of content the schema has',
    '<h2>Title</h2><h3>Sub</h3><p>a <strong>b</strong> <em>c</em> <code>d</code></p><ul><li>x</li></ul><ol><li>y</li></ol>',
    '<h2>Title</h2><h3>Sub</h3><p>a <strong>b</strong> <em>c</em> <code>d</code></p><ul><li>x</li></ul><ol><li>y</li></ol>',
  ],
  ['text with no markup', 'just text', 'just text'],
] as const

describe('sanitizePastedHtml', () => {
  it.each(cases)('leaves of %s only what is safe', (_name, html, sanitized) => {
    expect(sanitizePastedHtml(html)).toBe(sanitized)
  })

  it('never runs what it reads: an image with a handler does not load and its handler does not fire', () => {
    let fired = false
    Object.assign(globalThis, { __pasteFired: () => (fired = true) })

    sanitizePastedHtml(
      '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onload="__pasteFired()" onerror="__pasteFired()">',
    )

    expect(fired).toBe(false)
  })
})
