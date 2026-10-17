import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { ariaKeyShortcuts, shortcutLabel } from '../editor/shortcuts.ts'
import { commentShortcut } from './highlightPlugin.ts'
import type { SelectedText } from './useSelectionToComment.ts'
import styles from './SelectionAction.module.css'

/**
 * How a person starts a comment. With text selected it is the button that comments on it; without, the line that says how
 * to begin, so the row never changes height and nothing below it moves when a selection is made. The shortcut is on the
 * button, and it is explained to the person who has no pointer.
 */
export function SelectionAction({ selection, onStart }: { selection: SelectedText | null; onStart: () => void }) {
  const intl = useIntl()

  return (
    <div className={styles.row}>
      {selection === null ? (
        <p className={styles.hint}>{intl.formatMessage({ id: 'comments.action.hint' })}</p>
      ) : (
        <Button
          size="compact"
          aria-label={intl.formatMessage({ id: 'comments.action.label' })}
          aria-keyshortcuts={ariaKeyShortcuts(commentShortcut)}
          title={intl.formatMessage({ id: 'comments.action.tooltip' }, { shortcut: shortcutLabel(commentShortcut) })}
          onClick={onStart}
        >
          {intl.formatMessage({ id: 'comments.action.start' })}
        </Button>
      )}
    </div>
  )
}
