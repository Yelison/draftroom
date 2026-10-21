import { IconButton, Tooltip } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { ariaKeyShortcuts, shortcutLabel } from '../editor/shortcuts.ts'
import { commentShortcut } from './highlightPlugin.ts'
import styles from './SelectionAction.module.css'

/**
 * How a person starts a comment with the pointer: a button beside the text they selected. The shortcut is on the button, and
 * it is explained to the person who has no pointer. It is drawn only while there is a selection to comment on.
 */
export function SelectionAction({
  onStart,
  composing,
  className,
}: {
  onStart: () => void
  /**
   * Whether the form of a comment is open. The pointer is still over the button that opened it, and its tooltip would take the
   * Escape key that closes the form: while it is open the button says nothing.
   */
  composing: boolean
  className?: string
}) {
  const intl = useIntl()
  const label = intl.formatMessage({ id: 'comments.action.label' })

  return (
    <span className={className === undefined ? styles.action : `${styles.action} ${className}`}>
      <Tooltip
        content={intl.formatMessage({ id: 'comments.action.tooltip' }, { shortcut: shortcutLabel(commentShortcut) })}
        placement="bottom-end"
        describe={false}
        disabled={composing}
      >
        {(trigger) => (
          <IconButton
            {...trigger}
            icon="comment"
            label={label}
            aria-keyshortcuts={ariaKeyShortcuts(commentShortcut)}
            onClick={onStart}
          />
        )}
      </Tooltip>
    </span>
  )
}
