import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { openEditor } from './testing/renderEditor.tsx'

const buttons = [
  { id: 'bold', name: 'Bold', shortcut: 'Ctrl+B', keys: 'Control+B' },
  { id: 'italic', name: 'Italic', shortcut: 'Ctrl+I', keys: 'Control+I' },
  { id: 'code', name: 'Code', shortcut: 'Ctrl+E', keys: 'Control+E' },
  { id: 'heading2', name: 'Heading 2', shortcut: 'Ctrl+Alt+2', keys: 'Control+Alt+2' },
  { id: 'heading3', name: 'Heading 3', shortcut: 'Ctrl+Alt+3', keys: 'Control+Alt+3' },
  { id: 'bulletList', name: 'Bulleted list', shortcut: 'Ctrl+Shift+8', keys: 'Control+Shift+8' },
  { id: 'orderedList', name: 'Numbered list', shortcut: 'Ctrl+Shift+7', keys: 'Control+Shift+7' },
  { id: 'link', name: 'Link', shortcut: 'Ctrl+K', keys: 'Control+K' },
] as const

describe('the toolbar', () => {
  it('has a button with a name, a pressed state and its shortcut for each thing the schema can format', async () => {
    await openEditor()

    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    const found = screen.getAllByRole('button').filter((button) => toolbar.contains(button))
    expect(found.map((button) => button.getAttribute('aria-label'))).toEqual(buttons.map(({ name }) => name))
    for (const { name, keys } of buttons) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveAttribute('aria-pressed', 'false')
      expect(button).toHaveAttribute('aria-keyshortcuts', keys)
    }
  })

  it.each(buttons)(
    'says $shortcut in the tooltip of $name, on the keyboard as well as the mouse',
    async ({ name, shortcut }) => {
      const { user } = await openEditor()
      const button = screen.getByRole('button', { name })

      await user.hover(button)
      expect(await screen.findByRole('tooltip')).toHaveTextContent(`${name} (${shortcut})`)
      await user.unhover(button)
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

      act(() => button.focus())
      expect(await screen.findByRole('tooltip')).toHaveTextContent(`${name} (${shortcut})`)
    },
  )

  it('writes the shortcuts with the symbols of a Mac on a Mac', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    const { user } = await openEditor()

    await user.hover(screen.getByRole('button', { name: 'Heading 2' }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Heading 2 (⌘⌥2)')
    expect(screen.getByRole('button', { name: 'Heading 2' })).toHaveAttribute('aria-keyshortcuts', 'Meta+Alt+2')
    vi.restoreAllMocks()
  })

  it('names its buttons in Spanish when the person uses Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const { user } = await openEditor()

    const names = [
      'Negrita',
      'Cursiva',
      'Código',
      'Encabezado 2',
      'Encabezado 3',
      'Lista con viñetas',
      'Lista numerada',
      'Enlace',
    ]
    expect(screen.getByRole('toolbar', { name: 'Formato' })).toBeInTheDocument()
    for (const name of names) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    await user.hover(screen.getByRole('button', { name: 'Negrita' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Negrita (Ctrl+B)')
  })
})

describe('applying a format with the toolbar', () => {
  const cases = [
    { name: 'Bold', expected: { type: 'text', text: 'Some words', marks: [{ type: 'bold' }] } },
    { name: 'Italic', expected: { type: 'text', text: 'Some words', marks: [{ type: 'italic' }] } },
    { name: 'Code', expected: { type: 'text', text: 'Some words', marks: [{ type: 'code' }] } },
  ] as const

  it.each(cases)('$name marks the selected text', async ({ name, expected }) => {
    const { user, editor } = await openEditor()
    editor.commands.setContent('<p>Some words</p>')
    editor.commands.selectAll()

    await user.click(screen.getByRole('button', { name }))

    expect(editor.getJSON().content?.[0]?.content).toEqual([expected])
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
  })

  const blocks = [
    { name: 'Heading 2', node: { type: 'heading', attrs: { level: 2 } } },
    { name: 'Heading 3', node: { type: 'heading', attrs: { level: 3 } } },
    { name: 'Bulleted list', node: { type: 'bulletList' } },
    { name: 'Numbered list', node: { type: 'orderedList', attrs: { start: 1, type: null } } },
  ] as const

  it.each(blocks)('$name turns the paragraph into it, and pressing it again turns it back', async ({ name, node }) => {
    const { user, editor } = await openEditor()
    editor.commands.setContent('<p>Some words</p>')
    editor.commands.selectAll()

    await user.click(screen.getByRole('button', { name }))
    expect(editor.getJSON().content?.[0]).toMatchObject(node)
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name }))
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'paragraph' })
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
  })

  it('follows the selection: the pressed state is the one of the text the caret is in', async () => {
    const { editor } = await openEditor()
    editor.commands.setContent('<p>plain <strong>strong</strong></p>')

    editor.commands.setTextSelection(3)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false'))

    editor.commands.setTextSelection(9)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true'))

    editor.commands.setTextSelection(2)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false'))
  })

  it('does not take the focus from the text when it is pressed with the mouse', async () => {
    const { user, text, editor } = await openEditor()
    editor.commands.setContent('<p>Some words</p>')
    act(() => text.focus())
    editor.commands.selectAll()
    expect(text).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Bold' }))

    expect(text).toHaveFocus()
  })
})

describe('applying a format with the keyboard', () => {
  const cases = [
    { name: 'Bold', keys: '{Control>}b{/Control}', expected: { marks: [{ type: 'bold' }] } },
    { name: 'Italic', keys: '{Control>}i{/Control}', expected: { marks: [{ type: 'italic' }] } },
    { name: 'Code', keys: '{Control>}e{/Control}', expected: { marks: [{ type: 'code' }] } },
  ] as const

  it.each(cases)('$name: $keys marks the selected text', async ({ name, keys, expected }) => {
    const { user, text, editor } = await openEditor()
    editor.commands.setContent('<p>Some words</p>')
    act(() => text.focus())
    editor.commands.selectAll()

    await user.keyboard(keys)

    expect(editor.getJSON().content?.[0]?.content?.[0]).toMatchObject({ text: 'Some words', ...expected })
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    expect(text).toHaveFocus()
  })

  const blocks = [
    { name: 'Heading 2', keys: '{Control>}{Alt>}2{/Alt}{/Control}', node: { type: 'heading', attrs: { level: 2 } } },
    { name: 'Heading 3', keys: '{Control>}{Alt>}3{/Alt}{/Control}', node: { type: 'heading', attrs: { level: 3 } } },
    { name: 'Bulleted list', keys: '{Control>}{Shift>}8{/Shift}{/Control}', node: { type: 'bulletList' } },
    { name: 'Numbered list', keys: '{Control>}{Shift>}7{/Shift}{/Control}', node: { type: 'orderedList' } },
  ] as const

  it.each(blocks)('$name: $keys', async ({ name, keys, node }) => {
    const { user, text, editor } = await openEditor()
    editor.commands.setContent('<p>Some words</p>')
    act(() => text.focus())
    editor.commands.selectAll()

    await user.keyboard(keys)

    expect(editor.getJSON().content?.[0]).toMatchObject(node)
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('moving along the toolbar with the keyboard', () => {
  it('is one tab stop, before the title: Shift+Tab from the title reaches it and Tab leaves it', async () => {
    const { user } = await openEditor()
    const toolbar = screen.getByRole('toolbar')
    const tabbable = [...toolbar.querySelectorAll('button')].filter((button) => button.tabIndex === 0)
    expect(tabbable.map((button) => button.getAttribute('aria-label'))).toEqual(['Bold'])
    const title = screen.getByRole('textbox', { name: 'Document title' })
    await user.click(title)

    // The link to the history and the Share button of an owner sit between the toolbar and the title.
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Share' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Version history' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveFocus()
    await user.tab()
    await user.tab()
    await user.tab()
    expect(title).toHaveFocus()
  })

  it('moves with the arrow keys, Home and End, wrapping at the ends, and keeps the stop where it moved', async () => {
    const { user } = await openEditor()
    screen.getByRole('button', { name: 'Bold' }).focus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('button', { name: 'Link' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: 'Link' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveFocus()

    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Code' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('tabindex', '-1')
  })

  it('applies a format with Enter and Space and keeps the focus on the button', async () => {
    const { user, editor } = await openEditor()
    editor.commands.setContent('<p>Some words</p>')
    editor.commands.selectAll()
    const bold = screen.getByRole('button', { name: 'Bold' })
    bold.focus()

    await user.keyboard('{Enter}')
    expect(bold).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard(' ')
    expect(bold).toHaveAttribute('aria-pressed', 'false')
    expect(bold).toHaveFocus()
  })
})
