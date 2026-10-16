import { screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { localeStorageKey } from '../../i18n/locale.ts'
import { openEditor } from './testing/renderEditor.tsx'

const items = (count: number) => `<ul>${'<li>a</li>'.repeat(count)}</ul>`

describe('pasting more than may be unsent', () => {
  // A list of 35 000 short items is a few tens of kilobytes of text and megabytes of Yjs update: it is the bytes that
  // are measured, so it is refused though the text is small.
  it('refuses a list of 35 000 short items, says so, and leaves the text as it was', async () => {
    const { editor } = await openEditor()
    act(() => editor.commands.insertContent('Before'))

    act(() => editor.view.pasteHTML(items(35_000)))

    expect(await screen.findByText(/too much to paste/i)).toBeInTheDocument()
    expect(editor.getText()).toBe('Before')
  }, 60_000)

  it('says so in Spanish', async () => {
    localStorage.setItem(localeStorageKey, 'es')
    const { editor } = await openEditor()

    act(() => editor.view.pasteHTML(items(35_000)))

    expect(await screen.findByText(/demasiado para pegar/i)).toBeInTheDocument()
  }, 60_000)

  it('pastes what fits', async () => {
    const { editor } = await openEditor()

    act(() => editor.view.pasteHTML('<p>Hello world</p>'))

    await waitFor(() => expect(editor.getText()).toBe('Hello world'))
    expect(screen.queryByText(/too much to paste/i)).not.toBeInTheDocument()
  })
})
