import { useLayoutEffect, useState, type ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import { LocaleContext } from './LocaleContext.ts'
import { readStoredLocale, resolveLocale, storeLocale, type Locale } from './locale.ts'
import { messages } from './messages.ts'

export interface LocaleProviderProps {
  children: ReactNode
}

/**
 * Gives the app its messages in the language of the person and keeps `<html lang>` on the same language, so screen
 * readers pronounce the page right and the browser offers the right hyphenation and spell check.
 */
export function LocaleProvider({ children }: LocaleProviderProps) {
  const [locale, setLocale] = useState(() => resolveLocale(readStoredLocale(), navigator.languages))

  // <html> is outside React's tree: this is the one place that has to reach it. It is a layout effect so the
  // attribute is right before the browser paints.
  useLayoutEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  function choose(next: Locale) {
    storeLocale(next)
    setLocale(next)
  }

  return (
    <LocaleContext value={{ locale, setLocale: choose }}>
      <IntlProvider locale={locale} messages={messages[locale]}>
        {children}
      </IntlProvider>
    </LocaleContext>
  )
}
