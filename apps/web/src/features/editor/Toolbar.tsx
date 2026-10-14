import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useState, type KeyboardEvent } from 'react'
import { useIntl } from 'react-intl'
import { currentLinkHref } from './currentLink.ts'
import { applyFormat, formatActions } from './formatActions.ts'
import { ariaKeyShortcuts, shortcutLabel } from './shortcuts.ts'
import { ToolbarButton } from './ToolbarButton.tsx'
import styles from './Toolbar.module.css'

export interface ToolbarProps {
  editor: Editor
  /** Called when the link button is pressed, with the address of the link the cursor is in (or `null`). */
  onLinkRequest: (currentHref: string | null) => void
}

/**
 * The formatting toolbar: one tab stop for the whole bar, the arrow keys, Home and End to move along it, as the ARIA
 * toolbar pattern asks. The pressed state of each button follows the selection.
 */
export function Toolbar({ editor, onLinkRequest }: ToolbarProps) {
  const intl = useIntl()
  const [tabStop, setTabStop] = useState(0)
  // `useEditor` does not render again with every transaction, so the pressed states are read through the editor's own
  // subscription: it renders again only when one of them changes.
  const pressed = useEditorState({
    editor,
    selector: ({ editor: current }) => formatActions.map((action) => action.isActive(current)),
  })

  function moveWithKeys(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...event.currentTarget.querySelectorAll('button')]
    const current = buttons.findIndex((button) => button === document.activeElement)
    const target = {
      ArrowRight: (current + 1) % buttons.length,
      ArrowLeft: (current - 1 + buttons.length) % buttons.length,
      Home: 0,
      End: buttons.length - 1,
    }[event.key]
    if (target === undefined || current === -1) return
    event.preventDefault()
    buttons[target]?.focus()
  }

  return (
    // A toolbar is a composite widget: the keys above move inside it, so the handler belongs to the container.
    <div
      role="toolbar"
      aria-label={intl.formatMessage({ id: 'editor.toolbar.label' })}
      className={styles.toolbar}
      onKeyDown={moveWithKeys}
    >
      {formatActions.map((action, index) => {
        const name = intl.formatMessage({ id: action.name })
        return (
          <ToolbarButton
            key={action.id}
            name={name}
            tooltip={intl.formatMessage(
              { id: 'editor.toolbar.tooltip' },
              { name, shortcut: shortcutLabel(action.shortcut) },
            )}
            keyShortcuts={ariaKeyShortcuts(action.shortcut)}
            pressed={pressed[index] ?? false}
            tabIndex={index === tabStop ? 0 : -1}
            appearance={action.appearance}
            onFocus={() => setTabStop(index)}
            onPress={() => {
              if (action.id === 'link') onLinkRequest(currentLinkHref(editor))
              else applyFormat(editor, action.id)
            }}
          />
        )
      })}
    </div>
  )
}
