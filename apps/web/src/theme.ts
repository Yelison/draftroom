import { createThemeStore } from '@yelison/forma-ui'

/** Where the person's theme is remembered. The first-paint script in `index.html` reads the same key. */
export const themeStorageKey = 'draftroom-theme'

/** The theme preference of the app: light, dark or the operating system's. */
export const themeStore = createThemeStore({ storageKey: themeStorageKey })
