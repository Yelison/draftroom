/** The languages of the product. */
export const locales = ['en', 'es'] as const
export type Locale = (typeof locales)[number]

/**
 * What each language calls itself. A language is always named in itself, whatever language the page is in, so a person
 * who landed on a page they cannot read can still find theirs: these are fixed terms, not messages.
 */
export const localeNames: Record<Locale, string> = { en: 'English', es: 'Español' }

/** The language of a person whose browser speaks none of the others. */
export const defaultLocale: Locale = 'en'

/** Where the person's choice is remembered. The first-paint script reads the same key. */
export const localeStorageKey = 'draftroom-locale'

/**
 * The language to open in: the stored choice if it is one of `supported`, then the first browser language that is
 * (`es-MX` is Spanish), then `fallback`. Nothing in the URL takes part: paths are the same in every language.
 *
 * It uses nothing outside its own body, on purpose: `localeScript` writes this very function into the HTML, so the
 * script that runs before React and the app that runs after it cannot disagree about the language.
 */
export function pickLocale<Supported extends string>(
  supported: readonly Supported[],
  fallback: Supported,
  stored: string | null,
  browserLanguages: readonly string[],
): Supported {
  const choice = supported.find((locale) => locale === stored)
  if (choice !== undefined) return choice

  for (const tag of browserLanguages) {
    const language = tag.split('-')[0]?.toLowerCase()
    const spoken = supported.find((locale) => locale === language)
    if (spoken !== undefined) return spoken
  }
  return fallback
}

/** The language the app opens in, given the stored choice and the browser's languages. */
export function resolveLocale(stored: string | null, browserLanguages: readonly string[]): Locale {
  return pickLocale(locales, defaultLocale, stored, browserLanguages)
}

/** The stored choice, or null when there is none or storage cannot be read (private mode, blocked cookies). */
export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(localeStorageKey)
  } catch {
    return null
  }
}

/** Remembers the choice for the next visit. When storage cannot be written the choice lasts for this page. */
export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(localeStorageKey, locale)
  } catch {
    // Private mode or blocked storage: the language still changes, it is just not remembered.
  }
}
