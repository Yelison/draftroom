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
  [
    'a style that only sets colour and position',
    '<span style="color: red; position: fixed">x</span>',
    '<span>x</span>',
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
  ['a numbered list that starts at 0', '<ol start="0"><li>x</li></ol>', '<ol start="0"><li>x</li></ol>'],
  ['a numbered list that starts at 999999', '<ol start="999999"><li>x</li></ol>', '<ol start="999999"><li>x</li></ol>'],
  ['a start that is text', '<ol start="abc"><li>x</li></ol>', '<ol><li>x</li></ol>'],
  ['a negative start', '<ol start="-5"><li>x</li></ol>', '<ol><li>x</li></ol>'],
  ['a start in exponent form', '<ol start="1e3"><li>x</li></ol>', '<ol><li>x</li></ol>'],
  ['a start of seven digits', '<ol start="1000000"><li>x</li></ol>', '<ol><li>x</li></ol>'],
  ['a start with a space', '<ol start=" 3"><li>x</li></ol>', '<ol><li>x</li></ol>'],
  ['a start on an element that is not a list', '<p start="3">x</p>', '<p>x</p>'],
  ['the font weight of a span', '<span style="font-weight: 700">x</span>', '<span style="font-weight: 700">x</span>'],
  [
    'the font weight and style, and nothing else of a style',
    '<span style="COLOR: red; Font-Weight:BOLD; font-style : italic; position:fixed">x</span>',
    '<span style="font-weight: bold; font-style: italic">x</span>',
  ],
  ['a font weight that is not a weight', '<span style="font-weight: expression(alert(1))">x</span>', '<span>x</span>'],
  ['a font weight with a url', '<span style="font-weight: url(javascript:alert(1))">x</span>', '<span>x</span>'],
  [
    'a font weight with a second declaration hidden in it',
    '<span style="font-weight: 700 !important">x</span>',
    '<span>x</span>',
  ],
  [
    "the weight of Google Docs' wrapper",
    '<b style="font-weight:normal;" id="docs-internal-guid-1">x</b>',
    '<b style="font-weight: normal">x</b>',
  ],
  ["the editor's own mark on what it copied", '<p data-pm-slice="1 1 []">x</p>', '<p data-pm-slice="1 1 []">x</p>'],
  [
    'every kind of content the schema has',
    '<h2>Title</h2><h3>Sub</h3><p>a <strong>b</strong> <em>c</em> <code>d</code></p><ul><li>x</li></ul><ol><li>y</li></ol>',
    '<h2>Title</h2><h3>Sub</h3><p>a <strong>b</strong> <em>c</em> <code>d</code></p><ul><li>x</li></ul><ol><li>y</li></ol>',
  ],
  [
    'a clipboard mark that names a heading of level 1',
    '<span data-pm-slice="0 0 [&quot;heading&quot;,{&quot;level&quot;:1}]">x</span>',
    '<span>x</span>',
  ],
  [
    'a clipboard mark that names a heading of level 7',
    '<span data-pm-slice="0 0 [&quot;heading&quot;,{&quot;level&quot;:7}]">x</span>',
    '<span>x</span>',
  ],
  [
    'a clipboard mark that names a heading with text for a level',
    '<span data-pm-slice="0 0 [&quot;heading&quot;,{&quot;level&quot;:&quot;x onclick=1&quot;}]">x</span>',
    '<span>x</span>',
  ],
  [
    'a clipboard mark that names a node the schema lacks',
    '<span data-pm-slice="0 0 [&quot;blockquote&quot;,null]">x</span>',
    '<span>x</span>',
  ],
  ['a clipboard mark that is not JSON', '<span data-pm-slice="0 0 [heading">x</span>', '<span>x</span>'],
  [
    'a clipboard mark that names a heading of level 2',
    '<span data-pm-slice="0 0 [&quot;heading&quot;,{&quot;level&quot;:2}]">x</span>',
    '<span data-pm-slice="0 0 [&quot;heading&quot;,{&quot;level&quot;:2}]">x</span>',
  ],
  [
    "the editor's own mark on what it copied, with nothing wrapped",
    '<p data-pm-slice="1 1 []">x</p>',
    '<p data-pm-slice="1 1 []">x</p>',
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
