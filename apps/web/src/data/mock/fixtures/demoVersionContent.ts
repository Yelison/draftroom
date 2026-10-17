import type { JSONContent } from '@tiptap/core'
import type { Locale } from '../../../i18n/locale.ts'
import { demoContent } from './demoContent.ts'
import { interviews, launchPlan } from './documents.ts'
import { paragraph } from './blocks.ts'
import { seedId } from '../ids.ts'

// What each stored version of the demo held, in the language the demo started in: the same versions as `versionContent.ts`
// for the world of the tests, which has them in English. The last version of a document is the start of its live text, so
// opening the history shows what the document grew from, and restoring it leaves a text in the same language.

const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })

const earlier: Record<Locale, readonly [first: JSONContent, second: JSONContent][]> = {
  en: [
    [
      paragraph('The launch is planned for the first week of November.'),
      paragraph('Pricing is still open and nobody has reviewed the new tiers.'),
    ],
    [
      paragraph('The launch moves to the second week of November.'),
      paragraph('Pricing will be reviewed before anything is announced.'),
    ],
  ],
  es: [
    [
      paragraph('El lanzamiento está previsto para la primera semana de noviembre.'),
      paragraph('Los precios siguen abiertos y nadie ha revisado las nuevas tarifas.'),
    ],
    [
      paragraph('El lanzamiento pasa a la segunda semana de noviembre.'),
      paragraph('Los precios se revisarán antes de anunciar nada.'),
    ],
  ],
}

function versionsOf(locale: Locale): Readonly<Record<string, JSONContent>> {
  const [first, second] = earlier[locale]
  return {
    [seedId(7, 1)]: doc(...(first ?? [])),
    [seedId(7, 2)]: doc(...(second ?? [])),
    // The plan as it stood in its last stored version, and the interviews as they stood in theirs: the beginning of what
    // each document says now.
    [seedId(7, 3)]: doc(...(demoContent[locale][launchPlan.id] ?? []).slice(0, 2)),
    [seedId(7, 4)]: doc(...(demoContent[locale][interviews.id] ?? []).slice(0, 1)),
  }
}

export const demoVersionContent: Readonly<Record<Locale, Readonly<Record<string, JSONContent>>>> = {
  en: versionsOf('en'),
  es: versionsOf('es'),
}
