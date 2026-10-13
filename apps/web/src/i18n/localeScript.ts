import { pickLocale } from './locale.ts'

export interface LocaleScriptOptions {
  /** The `localStorage` key that holds the choice: the one `readStoredLocale` reads. */
  storageKey: string
  /** The languages of the product. */
  locales: readonly string[]
  /** The language of a person whose browser speaks none of them. */
  fallback: string
}

// A JavaScript string literal that is also safe inside an HTML <script> element: JSON.stringify covers quotes,
// backslashes and line breaks, and every `<` becomes its escape so `</script>` and `<!--` cannot end the element or
// open a comment. The library's `themeScript` does the same; its helper is private to the package.
const literal = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c')

// The source of pickLocale as the build left it has the line breaks and tabs of the code. It goes into every page, so
// they are squeezed. A comment inside pickLocale would take the rest of the script with it: the tests that run the
// script against resolveLocale would fail at once.
const compact = (source: string) => source.replace(/\s+/g, ' ')

/**
 * The first-paint script for the language: a string for an inline `<script>` in `<head>`. It sets `<html lang>` to the
 * language the app is about to open in, with the logic of `pickLocale` (written into the script, not copied by hand),
 * so the page is in the right language before React renders and a Spanish speaker never sees English.
 *
 * It has no dependencies and never throws. Its variables are block-scoped and the function stays an expression, so it
 * leaves nothing in the global scope. Storage that cannot be read leaves the browser to decide.
 *
 * It must be in the HTML that is served: a `<script>` that React renders on the client does not run.
 */
export function localeScript({ storageKey, locales, fallback }: LocaleScriptOptions): string {
  return (
    `try{const pick=${compact(pickLocale.toString())};let stored=null;` +
    `try{stored=localStorage.getItem(${literal(storageKey)})}catch{}` +
    `document.documentElement.lang=pick(${literal(locales)},${literal(fallback)},stored,navigator.languages)}catch{}`
  )
}
