/**
 * How a shortcut is written for the person's keyboard. Shortcuts are kept in Tiptap's own notation (`Mod-Alt-2`, where
 * `Mod` is Command on a Mac and Control elsewhere), so the label and the key that works never come from two lists.
 * The platform is read when a label is made, not when the module loads, so a test can change it.
 */
const isApple = () => /Mac|iPhone|iPad/.test(navigator.userAgent)

const symbols: Record<string, { apple: string; other: string; aria: { apple: string; other: string } }> = {
  Mod: { apple: '⌘', other: 'Ctrl', aria: { apple: 'Meta', other: 'Control' } },
  Alt: { apple: '⌥', other: 'Alt', aria: { apple: 'Alt', other: 'Alt' } },
  Shift: { apple: '⇧', other: 'Shift', aria: { apple: 'Shift', other: 'Shift' } },
}

const keyName = (key: string) => (key.length === 1 ? key.toUpperCase() : key)

/** The text of a shortcut to show: `Ctrl+Alt+2`, or `⌘⌥2` on a Mac. */
export function shortcutLabel(shortcut: string): string {
  const apple = isApple()
  const keys = shortcut.split('-').map((key) => {
    const modifier = symbols[key]
    return modifier === undefined ? keyName(key) : apple ? modifier.apple : modifier.other
  })
  return keys.join(apple ? '' : '+')
}

/** The same shortcut for `aria-keyshortcuts`, which spells modifiers out: `Control+Alt+2`, or `Meta+Alt+2` on a Mac. */
export function ariaKeyShortcuts(shortcut: string): string {
  const apple = isApple()
  return shortcut
    .split('-')
    .map((key) => {
      const modifier = symbols[key]
      return modifier === undefined ? keyName(key) : apple ? modifier.aria.apple : modifier.aria.other
    })
    .join('+')
}
