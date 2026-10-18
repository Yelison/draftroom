import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The tour finds what it clicks by the name a person (or a screen reader) gives it, so it reads the names from the same
// catalogues the app does: a renamed button fails the tour at the step that needs it, and the two languages are never copied.

export type Language = 'en' | 'es'

const catalogue = (language: Language): Record<string, string> =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/web/src/i18n/${language}.json`), 'utf8'))

const catalogues = { en: catalogue('en'), es: catalogue('es') }

/** A message in the language, with its plain `{name}` arguments filled in (the tour needs no plural or select). */
export function message(language: Language, id: string, values: Readonly<Record<string, string>> = {}): string {
  const text = catalogues[language][id]
  if (text === undefined) throw new Error(`The ${language} catalogue has no message "${id}": did it change?`)
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name]
    if (value === undefined) throw new Error(`The message "${id}" needs a value for {${name}}`)
    return value
  })
}
