import { act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { openEditor } from './testing/renderEditor.tsx'

/** What Chromium sends the text area when `Ctrl+Z` is pressed in a field that has nothing to undo, or when Undo is chosen from a menu. */
const historyEvent = (inputType: string) =>
  new InputEvent('beforeinput', { inputType, cancelable: true, bubbles: true })

describe('the undo of the browser', () => {
  it.each(['historyUndo', 'historyRedo'])(
    'is refused by the text area: %s does not reach the text',
    async (inputType) => {
      const { text } = await openEditor()
      const event = historyEvent(inputType)

      text.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
    },
  )

  it('leaves the other kinds of input to the editor', async () => {
    const { text } = await openEditor()
    const event = historyEvent('insertText')

    text.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('does not change the text when the person is not in it: the title was the field they were in', async () => {
    const { editor, text } = await openEditor()
    editor.commands.insertContent('Body words')

    text.dispatchEvent(historyEvent('historyUndo'))

    expect(editor.getText()).toBe('Body words')
  })

  it('does what the keys of Collaboration do when the person is in the text, as a menu would ask', async () => {
    const { editor, text } = await openEditor()
    editor.commands.insertContent('Body words')
    act(() => text.focus())

    text.dispatchEvent(historyEvent('historyUndo'))
    expect(editor.getText()).toBe('')

    text.dispatchEvent(historyEvent('historyRedo'))
    expect(editor.getText()).toBe('Body words')
  })
})
