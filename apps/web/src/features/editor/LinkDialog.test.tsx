import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { openEditor } from './testing/renderEditor.tsx'

const linkButton = () => screen.getByRole('button', { name: /^(Link|Enlace)$/ })
const dialog = (name: string) => screen.findByRole('dialog', { name })
// The explorer beside the editor, the band, the bar and the margin have live regions of their own: the link's is the one that
// is a direct child of the page of the document.
const announcement = () =>
  within(screen.getByRole('main'))
    .getAllByRole('status')
    .find((region) => region.textContent !== 'Loading document' && region.parentElement?.className === 'page')

describe('adding a link', () => {
  it('opens a dialog from the toolbar, asks for an address and links the selected text', async () => {
    const { user, editor } = await openEditor()
    editor.commands.setContent('<p>Read the plan</p>')
    editor.commands.setTextSelection({ from: 10, to: 14 })

    await user.click(linkButton())
    const form = within(await dialog('Add a link'))
    expect(form.getByLabelText('Link address')).toBeInTheDocument()
    expect(form.getByText('A web address or an email address.')).toBeInTheDocument()
    await user.type(form.getByLabelText('Link address'), 'example.com/plan')
    await user.click(form.getByRole('button', { name: 'Add link' }))

    expect(editor.getJSON().content?.[0]?.content).toEqual([
      { type: 'text', text: 'Read the ' },
      { type: 'text', text: 'plan', marks: [{ type: 'link', attrs: { href: 'https://example.com/plan' } }] },
    ])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(announcement()).toHaveTextContent('Link added')
  })

  it('refuses an address that is not a web or mail address and says why, without closing', async () => {
    const { user, editor } = await openEditor()
    editor.commands.setContent('<p>Read the plan</p>')
    editor.commands.selectAll()
    await user.click(linkButton())
    const form = within(await dialog('Add a link'))

    await user.type(form.getByLabelText('Link address'), 'javascript:alert(1)')
    await user.click(form.getByRole('button', { name: 'Add link' }))

    expect(await form.findByRole('alert')).toHaveTextContent(
      'Enter a web address that starts with http:// or https://, or an email address.',
    )
    expect(form.getByLabelText('Link address')).toBeInvalid()
    // The button was pressed, so the focus goes back to the field the message is about.
    expect(form.getByLabelText('Link address')).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Add a link' })).toBeInTheDocument()
    expect(JSON.stringify(editor.getJSON())).not.toContain('javascript')
  })

  it('takes the address as the text when nothing is selected and the cursor is not in a link', async () => {
    const { user, editor } = await openEditor()
    editor.commands.setContent('<p>See</p>')
    editor.commands.setTextSelection(4)
    await user.click(linkButton())

    await user.type(within(await dialog('Add a link')).getByLabelText('Link address'), 'https://example.com{Enter}')

    expect(editor.getJSON().content?.[0]?.content).toEqual([
      { type: 'text', text: 'See' },
      { type: 'text', text: 'https://example.com', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
    ])
  })

  it('opens from the keyboard with Ctrl+K in the text', async () => {
    const { user, text, editor } = await openEditor()
    editor.commands.setContent('<p>Read the plan</p>')
    act(() => text.focus())
    editor.commands.selectAll()

    await user.keyboard('{Control>}k{/Control}')

    expect(await dialog('Add a link')).toBeInTheDocument()
  })

  it('leaves the text alone when it is closed with the button', async () => {
    const { user, editor } = await openEditor()
    editor.commands.setContent('<p>Read the plan</p>')
    editor.commands.selectAll()
    await user.click(linkButton())

    await user.click(within(await dialog('Add a link')).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(JSON.stringify(editor.getJSON())).not.toContain('link')
    expect(announcement()).toBeEmptyDOMElement()
  })

  it('gives the focus back to the button that opened it', async () => {
    const { user, editor } = await openEditor()
    editor.commands.setContent('<p>Read the plan</p>')
    editor.commands.selectAll()
    linkButton().focus()
    await user.keyboard('{Enter}')

    await user.click(within(await dialog('Add a link')).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(linkButton()).toHaveFocus())
  })
})

describe('changing a link', () => {
  const withLink = '<p>Read the <a href="https://example.com/plan">whole plan</a> today</p>'

  it('opens with the address the cursor is on, and the button is pressed', async () => {
    const { user, editor } = await openEditor()
    editor.commands.setContent(withLink)
    editor.commands.setTextSelection(14)
    await waitFor(() => expect(linkButton()).toHaveAttribute('aria-pressed', 'true'))

    await user.click(linkButton())

    const form = within(await dialog('Edit link'))
    expect(form.getByLabelText('Link address')).toHaveValue('https://example.com/plan')
    expect(form.getByRole('button', { name: 'Update link' })).toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Remove link' })).toBeInTheDocument()
  })

  it('changes the address of the whole link, not only the part the cursor is in', async () => {
    const { user, editor } = await openEditor()
    editor.commands.setContent(withLink)
    editor.commands.setTextSelection(14)
    await user.click(linkButton())
    const field = within(await dialog('Edit link')).getByLabelText('Link address')

    await user.clear(field)
    await user.type(field, 'https://example.org/new{Enter}')

    expect(editor.getJSON().content?.[0]?.content).toEqual([
      { type: 'text', text: 'Read the ' },
      { type: 'text', text: 'whole plan', marks: [{ type: 'link', attrs: { href: 'https://example.org/new' } }] },
      { type: 'text', text: ' today' },
    ])
    expect(announcement()).toHaveTextContent('Link updated')
  })

  it('removes the link and keeps its text', async () => {
    const { user, editor } = await openEditor()
    editor.commands.setContent(withLink)
    editor.commands.setTextSelection(14)
    await user.click(linkButton())

    await user.click(within(await dialog('Edit link')).getByRole('button', { name: 'Remove link' }))

    expect(editor.getJSON().content?.[0]?.content).toEqual([{ type: 'text', text: 'Read the whole plan today' }])
    expect(announcement()).toHaveTextContent('Link removed')
  })

  it('starts from the link under the cursor each time, not from what was typed before', async () => {
    const { user, editor } = await openEditor()
    editor.commands.setContent(withLink)
    editor.commands.setTextSelection(14)
    await user.click(linkButton())
    await user.type(within(await dialog('Edit link')).getByLabelText('Link address'), 'xyz')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(linkButton())

    expect(within(await dialog('Edit link')).getByLabelText('Link address')).toHaveValue('https://example.com/plan')
  })
})

describe('the dialog in Spanish', () => {
  it('is written in Spanish, with the announcement too', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const { user, editor } = await openEditor()
    editor.commands.setContent('<p>Lee el plan</p>')
    editor.commands.selectAll()

    await user.click(linkButton())
    const form = within(await dialog('Añadir un enlace'))
    await user.type(form.getByLabelText('Dirección del enlace'), 'ejemplo.com{Enter}')

    await waitFor(() => expect(announcement()).toHaveTextContent('Enlace añadido'))
  })
})
