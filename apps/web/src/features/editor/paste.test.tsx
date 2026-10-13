import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { openEditor } from './testing/renderEditor.tsx'

type Mark = { type: string; attrs?: Record<string, unknown> }

const text = (value: string, ...marks: Mark[]): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks.length > 0 && { marks }),
})
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const link = (href: string): Mark => ({ type: 'link', attrs: { href } })

/** What a paste becomes in the document: the HTML a person copied, and the content the editor holds after it. */
const cases: [string, string, JSONContent[]][] = [
  ['a script', '<p>Hi</p><script>alert(1)</script>', [paragraph(text('Hi'))]],
  ['an inline handler', '<p onclick="alert(1)">Hi</p>', [paragraph(text('Hi'))]],
  [
    'an image that fails to load',
    '<p>a</p><img src="x" onerror="alert(1)">text',
    [paragraph(text('a')), paragraph(text('text'))],
  ],
  ['an iframe', '<iframe src="https://evil.example"></iframe><p>ok</p>', [paragraph(text('ok'))]],
  ['an SVG with a script inside', '<p>a</p><svg><script>alert(1)</script></svg>', [paragraph(text('a'))]],
  ['a style attribute', '<p style="color: red; position: fixed">styled</p>', [paragraph(text('styled'))]],
  ['a style element', '<style>p { display: none }</style><p>text</p>', [paragraph(text('text'))]],
  ['a javascript: link', '<p><a href="javascript:alert(1)">click</a></p>', [paragraph(text('click'))]],
  ['a javascript: link in mixed case', '<p><a href="JaVaScRiPt:alert(1)">click</a></p>', [paragraph(text('click'))]],
  [
    'a javascript: link split by an entity tab',
    '<p><a href="java&#9;script:alert(1)">click</a></p>',
    [paragraph(text('click'))],
  ],
  ['a javascript: link after a space', '<p><a href=" javascript:alert(1)">click</a></p>', [paragraph(text('click'))]],
  ['a data: link', '<p><a href="data:text/html;base64,PHNjcmlwdD4=">click</a></p>', [paragraph(text('click'))]],
  ['a relative link', '<p><a href="/relative">r</a> <a href="//host/x">h</a></p>', [paragraph(text('r h'))]],
  [
    'a link that carries a target, a rel, a class and a handler',
    '<p><a href="https://example.com" target="_top" rel="opener" class="x" onclick="x()">l</a></p>',
    [paragraph(text('l', link('https://example.com')))],
  ],
  ['a mail link', '<p><a href="mailto:a@b.co">m</a></p>', [paragraph(text('m', link('mailto:a@b.co')))]],
  // What the schema does not have becomes the text it held.
  ['a quotation', '<blockquote><p>q</p></blockquote>', [paragraph(text('q'))]],
  ['a code block', '<pre><code>let a = 1</code></pre>', [paragraph(text('let a = 1', { type: 'code' }))]],
  ['a horizontal rule', '<p>a</p><hr><p>b</p>', [paragraph(text('a')), paragraph(text('b'))]],
  ['a table', '<table><tr><td>cell</td></tr></table>', [paragraph(text('cell'))]],
  ['a heading of level 1', '<h1>Big</h1>', [paragraph(text('Big'))]],
  [
    'underline, strike-through and a styled span',
    '<p><u>u</u> <s>s</s> <span style="font-weight: bold">span</span></p>',
    [paragraph(text('u s span'))],
  ],
  ['a line break', '<p>a<br>b</p>', [paragraph(text('a b'))]],
  // What the schema has is kept.
  [
    'headings, marks and lists',
    '<h2>Title</h2><p>a <strong>b</strong> <em>c</em> <code>d</code></p><ul><li>x</li></ul>',
    [
      { type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
      paragraph(
        text('a '),
        text('b', { type: 'bold' }),
        text(' '),
        text('c', { type: 'italic' }),
        text(' '),
        text('d', { type: 'code' }),
      ),
      { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('x'))] }] },
    ],
  ],
]

describe('pasting HTML', () => {
  it.each(cases)('leaves of %s only what the schema holds', async (_name, html, content) => {
    const { editor } = await openEditor()

    editor.view.pasteHTML(html)

    expect(editor.getJSON().content).toEqual(content)
  })

  it('puts nothing of what was refused into the page', async () => {
    const { editor, text: area } = await openEditor()

    editor.view.pasteHTML(
      '<p onclick="alert(1)" style="color:red"><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)></p><script>alert(1)</script>',
    )

    expect(area.innerHTML).not.toMatch(/javascript|onclick|onerror|<script|<img|style=/i)
  })

  it('gives every pasted link the same rel and target, whatever it came with', async () => {
    const { editor, text: area } = await openEditor()

    editor.view.pasteHTML('<p><a href="https://example.com" target="_top" rel="opener">l</a></p>')

    const anchor = area.querySelector('a')
    expect(anchor).toHaveAttribute('href', 'https://example.com')
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer')
    expect(anchor).toHaveAttribute('target', '_blank')
  })

  it('goes through the sanitizer before the schema reads it', async () => {
    const { editor } = await openEditor()

    const transform = editor.view.props.transformPastedHTML

    expect(transform?.('<p onclick="x()">a</p><script>x()</script>', editor.view)).toBe('<p>a</p>')
  })
})

describe('pasting plain text', () => {
  it('becomes paragraphs, one for each line', async () => {
    const { editor } = await openEditor()

    editor.view.pasteText('first line\n\nsecond line')

    expect(editor.getJSON().content).toEqual([paragraph(text('first line')), paragraph(text('second line'))])
  })

  it('keeps markup-looking text as the text it is', async () => {
    const { editor } = await openEditor()

    editor.view.pasteText('<script>alert(1)</script> and <b>bold</b>')

    expect(editor.getJSON().content).toEqual([paragraph(text('<script>alert(1)</script> and <b>bold</b>'))])
  })

  it('does not turn text that is an address into one that runs', async () => {
    const { editor, text: area } = await openEditor()

    editor.view.pasteText('javascript:alert(1) and https://example.com')

    expect(area.innerHTML).not.toMatch(/href="javascript/i)
    expect(JSON.stringify(editor.getJSON())).toContain('"href":"https://example.com"')
  })
})
