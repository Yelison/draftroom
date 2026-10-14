import { focusManager } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DataSource } from '../../data/DataSource.ts'
import { useLocale } from '../../i18n/useLocale.ts'
import { openEditor } from './testing/renderEditor.tsx'

/** A data source whose document has the role the test sets, to change it while the document is open. */
function roleSwitch() {
  const state = { role: 'owner' as 'owner' | 'viewer' }
  const wrap = (dataSource: DataSource): DataSource => ({
    ...dataSource,
    getDocument: async (request) => ({ ...(await dataSource.getDocument(request)), role: state.role }),
  })
  /** The window gets its focus back, which is what makes the screen read the document again. */
  const refetch = () => {
    act(() => focusManager.setFocused(false))
    act(() => focusManager.setFocused(true))
  }
  return { state, wrap, refetch }
}

function SwitchToSpanish() {
  const { setLocale } = useLocale()
  return <button onClick={() => setLocale('es')}>switch</button>
}

describe('an editor that is open when the role or the language changes', () => {
  it('stays the same editor when the person stops being able to edit, with its text, selection and undo history', async () => {
    const { state, wrap, refetch } = roleSwitch()
    const { editor, text } = await openEditor({ wrap })
    editor.commands.insertContent('Hello world')
    editor.commands.setTextSelection({ from: 3, to: 8 })

    state.role = 'viewer'
    refetch()

    await waitFor(() => expect(text).toHaveAttribute('contenteditable', 'false'))
    expect(text).toHaveAttribute('aria-readonly', 'true')
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Document content' })).toBe(text)
    expect(editor.isDestroyed).toBe(false)
    expect(editor.state.selection).toMatchObject({ from: 3, to: 8 })
    expect(editor.getText()).toBe('Hello world')

    state.role = 'owner'
    refetch()

    await waitFor(() => expect(text).toHaveAttribute('contenteditable', 'true'))
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument()
    expect(editor.isDestroyed).toBe(false)
    // The undo history of Collaboration is still there: the typed text goes with one undo.
    expect(editor.commands.undo()).toBe(true)
    expect(editor.getText()).toBe('')
  })

  it('stays the same editor when the language changes, and names the text area in the new one', async () => {
    const { editor, text, user } = await openEditor({ extra: <SwitchToSpanish /> })
    editor.commands.insertContent('Hello')
    editor.commands.setTextSelection(2)

    await user.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => expect(text).toHaveAttribute('aria-label', 'Contenido del documento'))
    expect(screen.getByRole('textbox', { name: 'Contenido del documento' })).toBe(text)
    expect(editor.isDestroyed).toBe(false)
    expect(editor.state.selection.from).toBe(2)
    expect(editor.getText()).toBe('Hello')
    expect(editor.commands.undo()).toBe(true)
  })
})
