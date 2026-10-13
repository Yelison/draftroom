import { Extension } from '@tiptap/core'
import { currentLinkHref } from './currentLink.ts'
import { linkShortcut } from './formatActions.ts'

export interface LinkShortcutOptions {
  /** Called with the address of the link the cursor is in, or `null` when it is in none. */
  onRequest: (currentHref: string | null) => void
}

/** Binds the key that opens the link dialog, which Tiptap's link does not have. */
export const LinkShortcut = Extension.create<LinkShortcutOptions>({
  name: 'linkShortcut',

  addKeyboardShortcuts() {
    return {
      [linkShortcut]: ({ editor }) => {
        this.options.onRequest(currentLinkHref(editor))
        return true
      },
    }
  },
})
