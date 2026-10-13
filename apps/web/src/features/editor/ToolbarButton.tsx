import { IconButton, Tooltip } from '@yelison/forma-ui'
import type { Appearance } from './formatActions.ts'
import styles from './Toolbar.module.css'

export interface ToolbarButtonProps {
  /** The accessible name, already in the language of the app. */
  name: string
  /** What the tooltip says: the name and the shortcut. */
  tooltip: string
  /** The shortcut spelled out for `aria-keyshortcuts`. */
  keyShortcuts: string
  pressed: boolean
  /** The roving tab stop: `0` for the one button the Tab key reaches, `-1` for the others. */
  tabIndex: 0 | -1
  appearance: Appearance
  onPress: () => void
  onFocus: () => void
}

const glyphClass = { bold: styles.bold, italic: styles.italic, code: styles.code, plain: undefined } as const

/**
 * A button of the formatting toolbar: a toggle with a name, a pressed state, a tooltip that says its shortcut, and a
 * place in the toolbar's single tab stop.
 */
export function ToolbarButton({
  name,
  tooltip,
  keyShortcuts,
  pressed,
  tabIndex,
  appearance,
  onPress,
  onFocus,
}: ToolbarButtonProps) {
  return (
    // The tooltip repeats the name and adds the shortcut, which `aria-keyshortcuts` already tells a screen reader, so it
    // is not read out as a description as well.
    <Tooltip content={tooltip} placement="bottom-start" describe={false}>
      {(trigger) => {
        const shared = {
          ...trigger,
          'aria-pressed': pressed,
          'aria-keyshortcuts': keyShortcuts,
          tabIndex,
          className: styles.button,
          onClick: onPress,
          onFocus: () => {
            trigger.onFocus()
            onFocus()
          },
          // A button that took the focus on a mouse down would take it from the text, and typing would stop until the
          // person clicked back into it. The mouse still presses the button; the keyboard is not affected.
          onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
        }
        return 'icon' in appearance ? (
          <IconButton icon={appearance.icon} label={name} {...shared} />
        ) : (
          <button type="button" aria-label={name} {...shared}>
            <span aria-hidden="true" className={glyphClass[appearance.glyphStyle]}>
              {appearance.glyph}
            </span>
          </button>
        )
      }}
    </Tooltip>
  )
}
