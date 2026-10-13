import { createContext } from 'react'
import type { Locale } from './locale.ts'

export interface LocaleContextValue {
  /** The language the app is in. */
  locale: Locale
  /** Switches the app to another language and remembers the choice for the next visit. */
  setLocale: (locale: Locale) => void
}

export const LocaleContext = createContext<LocaleContextValue | null>(null)
