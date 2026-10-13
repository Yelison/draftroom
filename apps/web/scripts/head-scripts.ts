import { themeScript } from '@yelison/forma-ui'
import { defaultLocale, localeStorageKey, locales } from '../src/i18n/locale.ts'
import { localeScript } from '../src/i18n/localeScript.ts'
import { themeStorageKey } from '../src/theme.ts'

/**
 * The scripts that run in `<head>` before the first paint: the theme, with the library's own script and the key the
 * theme store of the app uses, and the language, generated from `pickLocale`, the function the app resolves the
 * language with too. The Vite configuration puts them in the HTML and the tests run them from here.
 */
export const headScripts = [
  themeScript({ storageKey: themeStorageKey }),
  localeScript({ storageKey: localeStorageKey, locales, fallback: defaultLocale }),
]
