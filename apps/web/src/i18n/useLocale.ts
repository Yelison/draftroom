import { use } from 'react'
import { LocaleContext, type LocaleContextValue } from './LocaleContext.ts'

/** The language of the app and the way to change it. */
export function useLocale(): LocaleContextValue {
  const value = use(LocaleContext)
  if (value === null) throw new Error('useLocale needs a LocaleProvider above it')
  return value
}
