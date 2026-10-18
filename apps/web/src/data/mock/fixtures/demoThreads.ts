import type { JSONContent } from '@tiptap/core'
import type { Locale } from '../../../i18n/locale.ts'
import { seedId } from '../ids.ts'
import type { ThreadRecord } from './collaboration.ts'
import { paragraph } from './blocks.ts'
import { launchPlan } from './documents.ts'
import { seed } from './index.ts'
import { daniel, marta } from './people.ts'

/** What a thread says in one language: the text it quotes, and its comments in the order the thread has them. */
export interface ThreadText {
  quote: string
  comments: readonly string[]
}

/**
 * The threads of the demo, in each language. The quote of a thread is a sentence of its document in that language
 * (`demoContent.ts`): the anchor is found in the text by it.
 */
export const threadText: Record<Locale, Readonly<Record<string, ThreadText>>> = {
  en: {
    [seedId(5, 1)]: {
      quote: 'once the pricing review is signed off',
      comments: [
        'Who signs it off? Finance has not seen the new tiers yet.',
        'I will ask for a slot on Thursday and update the date here.',
      ],
    },
    [seedId(5, 2)]: {
      quote: 'second week of November',
      comments: ['Can we confirm this does not clash with the conference?'],
    },
    [seedId(5, 3)]: {
      quote: 'keep the language selector in settings',
      comments: ['What if we also keep it on the sign-in screen?'],
    },
    [seedId(5, 4)]: {
      quote: 'Legal reviews the new terms before the announcement.',
      comments: [
        'Should legal read the new terms before we announce?',
        'Good point. I took that line out and will cover it in the checklist.',
      ],
    },
  },
  es: {
    [seedId(5, 1)]: {
      quote: 'cuando se apruebe la revisión de precios',
      comments: [
        '¿Quién lo aprueba? Finanzas todavía no ha visto las nuevas tarifas.',
        'Pediré un hueco para el jueves y actualizaré la fecha aquí.',
      ],
    },
    [seedId(5, 2)]: {
      quote: 'segunda semana de noviembre',
      comments: ['¿Podemos confirmar que esto no coincide con la conferencia?'],
    },
    [seedId(5, 3)]: {
      quote: 'dejar el selector de idioma en los ajustes',
      comments: ['¿Y si lo dejamos también en la pantalla de inicio de sesión?'],
    },
    [seedId(5, 4)]: {
      quote: 'Legal revisa los nuevos términos antes del anuncio.',
      comments: [
        '¿Debería Legal leer los nuevos términos antes de anunciarlo?',
        'Buena observación. He quitado esa línea y la cubriré en la lista de tareas.',
      ],
    },
  },
}

/**
 * A thread that only the demo has: its text was in the launch plan when it was written and was taken out later, so it is
 * orphaned. The fixtures of the tests do not have it, so the lists and the counts they check stay as they are.
 */
export const withdrawnThread: ThreadRecord = {
  id: seedId(5, 4),
  documentId: launchPlan.id,
  status: 'open',
  // Replaced by the anchor the starting content gives it (`demoDocuments.ts`).
  anchor: { start: 'AQAKAA==', end: 'AQAYAQ==' },
  quote: threadText.en[seedId(5, 4)]?.quote ?? '',
  createdBy: daniel.id,
  createdAt: '2026-10-13T08:10:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
  comments: [
    {
      id: seedId(6, 5),
      authorId: daniel.id,
      body: threadText.en[seedId(5, 4)]?.comments[0] ?? '',
      createdAt: '2026-10-13T08:10:00.000Z',
      updatedAt: '2026-10-13T08:10:00.000Z',
    },
    {
      id: seedId(6, 6),
      authorId: marta.id,
      body: threadText.en[seedId(5, 4)]?.comments[1] ?? '',
      createdAt: '2026-10-13T08:35:00.000Z',
      updatedAt: '2026-10-13T08:35:00.000Z',
    },
  ],
}

/** Every thread of the demo: the fixtures' and the one only the demo has. */
export const demoThreads: readonly ThreadRecord[] = [...seed.threads, withdrawnThread]

/** The sentence a document held when `withdrawnThread` was written and no longer holds, in each language. */
export const withdrawnBlocks: Record<Locale, Readonly<Record<string, readonly JSONContent[]>>> = {
  en: { [launchPlan.id]: [paragraph('Legal reviews the new terms before the announcement.')] },
  es: { [launchPlan.id]: [paragraph('Legal revisa los nuevos términos antes del anuncio.')] },
}
