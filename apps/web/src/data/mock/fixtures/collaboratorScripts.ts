import type { Locale } from '../../../i18n/locale.ts'
import { brandVoice, launchPlan } from './documents.ts'
import { daniel, sofia, type PersonRecord } from './people.ts'

/** A line she writes: she types `draft`, thinks, and rewrites the end of it until it reads `final`. */
export interface ScriptLine {
  readonly draft: string
  readonly final: string
}

/**
 * The people who are writing in a document of the demo when the visitor opens it, and what they write. Each line
 * continues the last paragraph of the document (`demoContent.ts`), so a leading space is part of it. They are people of
 * the fixtures who already may edit the document, and they write in the language the demo started in.
 */
export interface CollaboratorScript {
  readonly documentId: string
  readonly person: PersonRecord
  readonly lines: Readonly<Record<Locale, readonly ScriptLine[]>>
}

export const collaboratorScripts: readonly CollaboratorScript[] = [
  {
    documentId: launchPlan.id,
    person: daniel,
    lines: {
      en: [
        {
          draft: ' whether the free trial stays at fourteen days.',
          final: ' whether the free trial stays at fourteen days or grows to thirty.',
        },
        {
          draft: ' who signs off the comparison table.',
          final: ' who signs off the comparison table before the page goes live.',
        },
        {
          draft: ' the date of the training for support.',
          final: ' the date of the training for support, ideally before the announcement.',
        },
      ],
      es: [
        {
          draft: ' si la prueba gratuita se queda en catorce días.',
          final: ' si la prueba gratuita se queda en catorce días o pasa a treinta.',
        },
        {
          draft: ' quién aprueba la tabla comparativa.',
          final: ' quién aprueba la tabla comparativa antes de publicar la página.',
        },
        {
          draft: ' la fecha de la formación para soporte.',
          final: ' la fecha de la formación para soporte, mejor antes del anuncio.',
        },
      ],
    },
  },
  {
    documentId: brandVoice.id,
    person: sofia,
    lines: {
      en: [
        {
          draft: ' an error message that stays calm.',
          final: ' an error message that stays calm and says what to do next.',
        },
        {
          draft: ' how we say no to a request.',
          final: ' how we say no to a request without closing the door.',
        },
      ],
      es: [
        {
          draft: ' un mensaje de error que mantenga la calma.',
          final: ' un mensaje de error que mantenga la calma y diga qué hacer después.',
        },
        {
          draft: ' cómo decimos que no a una petición.',
          final: ' cómo decimos que no a una petición sin cerrar la puerta.',
        },
      ],
    },
  },
]
