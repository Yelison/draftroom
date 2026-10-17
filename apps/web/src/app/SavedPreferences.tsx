import { useQuery } from '@tanstack/react-query'
import { useEffect, useEffectEvent } from 'react'
import { useDataSource } from '../data/useDataSource.ts'
import { meQuery } from '../features/editor/meQuery.ts'
import { retryTransportOnce } from '../features/documents/queries.ts'
import { useLocale } from '../i18n/useLocale.ts'
import './editorTextSize.css'

/**
 * Puts the preferences saved on the account to work, on every page: the language, which takes precedence over the
 * browser's, and the size of the editor text. It draws nothing.
 *
 * The language is chosen once the account is known, and `setLocale` remembers it, so the next visit already opens in it
 * before anything is asked. An account that has not chosen (`null`) leaves the language as the browser decides.
 */
export function SavedPreferences() {
  const dataSource = useDataSource()
  const { data: me } = useQuery({ ...meQuery(dataSource), retry: retryTransportOnce })
  const { setLocale } = useLocale()
  const chosenLocale = me?.locale ?? null
  const textSize = me?.editorTextSize ?? 'medium'

  // Only a change of the account's language switches the app: the effect must not read the app's own language as a
  // reason to run, or it would undo any other way of changing it.
  const applyLocale = useEffectEvent(setLocale)
  useEffect(() => {
    if (chosenLocale !== null) applyLocale(chosenLocale)
  }, [chosenLocale])

  // <html> is outside React's tree, like its language: the stylesheet reads the size from there.
  useEffect(() => {
    const root = document.documentElement
    if (textSize === 'medium') delete root.dataset['editorTextSize']
    else root.dataset['editorTextSize'] = textSize
  }, [textSize])

  return null
}
