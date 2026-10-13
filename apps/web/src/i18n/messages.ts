import en from './en.json'
import es from './es.json'
import type { Locale } from './locale.ts'

/**
 * The messages of each language. In the production build the JSON files are replaced by their precompiled syntax trees
 * (`scripts/messages-ast.ts`), which react-intl accepts in the same place as the strings the tests and the dev server use.
 */
export const messages: Record<Locale, Record<string, string>> = { en, es }
