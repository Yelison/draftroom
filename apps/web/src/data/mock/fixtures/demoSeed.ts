import type { Locale } from '../../../i18n/locale.ts'
import { seedId } from '../ids.ts'
import { demoThreads, threadText } from './demoThreads.ts'
import { demoVersionContent } from './demoVersionContent.ts'
import {
  brandVoice,
  budget,
  designReview,
  interviews,
  launchPlan,
  oldPricing,
  onboardingChecklist,
  weeklyEnglish,
} from './documents.ts'
import { seed, type Fixtures } from './index.ts'
import { ideasFolder, operationsFolder, productFolder, researchFolder } from './workspaces.ts'

// The world of the static demo, in one language. The fixtures that serve the tests are a mix of both (a document in
// English and its twin in Spanish, a folder in each), which suits tests that look for either; a visitor of the demo
// should see everything in the language the demo started in. So the demo has one set of documents, and the title, the
// excerpt, the folders, the comments and the version labels of it are written in that language. The people and the
// workspaces are the same: names are not translated.

interface DocumentText {
  title: string
  excerpt: string | null
}

const documentText: Record<Locale, Readonly<Record<string, DocumentText>>> = {
  en: {
    [launchPlan.id]: {
      title: 'Autumn launch plan',
      excerpt: 'The launch moves to the second week of November, once the pricing review is signed off.',
    },
    [designReview.id]: {
      title: 'Design review notes',
      excerpt: 'We agreed to simplify the sidebar and keep the language selector in settings.',
    },
    [weeklyEnglish.id]: {
      title: 'Weekly update — October 6',
      excerpt: 'Onboarding emails are live. The billing migration is waiting on one decision from finance.',
    },
    [interviews.id]: {
      title: 'Customer interview synthesis',
      excerpt: 'Teams keep their notes in three places. Nobody trusts the one that is meant to be the source.',
    },
    [brandVoice.id]: {
      title: 'Brand voice guide',
      excerpt: 'We write the way we talk to a colleague: short sentences, no jargon, a little warmth.',
    },
    [budget.id]: {
      title: '2027 budget',
      excerpt: 'Hiring, tools and travel assumptions for next year.',
    },
    [onboardingChecklist.id]: {
      title: 'Onboarding checklist',
      excerpt: 'Accounts, equipment and the three people to meet in the first week.',
    },
    [oldPricing.id]: {
      title: 'Old pricing draft',
      excerpt: 'Three tiers, with a free plan that we dropped after the first review.',
    },
  },
  es: {
    [launchPlan.id]: {
      title: 'Plan de lanzamiento de otoño',
      excerpt: 'El lanzamiento pasa a la segunda semana de noviembre, cuando se apruebe la revisión de precios.',
    },
    [designReview.id]: {
      title: 'Notas de la revisión de diseño',
      excerpt: 'Acordamos simplificar la barra lateral y dejar el selector de idioma en los ajustes.',
    },
    [weeklyEnglish.id]: {
      title: 'Actualización semanal — 6 de octubre',
      excerpt:
        'Los correos de bienvenida ya están activos. La migración de facturación espera una decisión de finanzas.',
    },
    [interviews.id]: {
      title: 'Síntesis de entrevistas con clientes',
      excerpt: 'Los equipos guardan sus notas en tres sitios y nadie se fía del que debería ser la fuente.',
    },
    [brandVoice.id]: {
      title: 'Guía de voz de marca',
      excerpt: 'Escribimos como hablamos con un compañero: frases cortas, sin jerga y con un poco de calidez.',
    },
    [budget.id]: {
      title: 'Presupuesto 2027',
      excerpt: 'Hipótesis de contratación, herramientas y viajes para el próximo año.',
    },
    [onboardingChecklist.id]: {
      title: 'Lista de incorporación',
      excerpt: 'Cuentas, equipo y las tres personas que conocer durante la primera semana.',
    },
    [oldPricing.id]: {
      title: 'Borrador de precios anterior',
      excerpt: 'Tres tarifas, con un plan gratuito que descartamos tras la primera revisión.',
    },
  },
}

const folderNames: Record<Locale, Readonly<Record<string, string>>> = {
  en: {
    [productFolder.id]: 'Product',
    [researchFolder.id]: 'Research',
    [operationsFolder.id]: 'Operations',
    [ideasFolder.id]: 'Ideas',
  },
  es: {
    [productFolder.id]: 'Producto',
    [researchFolder.id]: 'Investigación',
    [operationsFolder.id]: 'Operaciones',
    [ideasFolder.id]: 'Ideas',
  },
}

const versionLabels: Record<Locale, Readonly<Record<string, string>>> = {
  en: { [seedId(7, 2)]: 'Before the pricing review', [seedId(7, 4)]: 'Draft for the team' },
  es: { [seedId(7, 2)]: 'Antes de la revisión de precios', [seedId(7, 4)]: 'Borrador para el equipo' },
}

/** The fixtures of the demo in `locale`: one set of documents, and everything a person reads written in that language. */
export function demoFixtures(locale: Locale): Fixtures {
  const text = documentText[locale]
  const kept = new Set(Object.keys(text))
  const isKept = ({ documentId }: { documentId: string }) => kept.has(documentId)
  return {
    seed: {
      ...seed,
      documents: seed.documents.flatMap((row) => {
        const written = text[row.id]
        return written === undefined ? [] : [{ ...row, ...written }]
      }),
      folders: seed.folders.map((row) => ({ ...row, name: folderNames[locale][row.id] ?? row.name })),
      grants: seed.grants.filter(isKept),
      pins: seed.pins.filter(isKept),
      threads: demoThreads.filter(isKept).map((row) => {
        const written = threadText[locale][row.id]
        return written === undefined
          ? row
          : {
              ...row,
              quote: written.quote,
              comments: row.comments.map((comment, index) => ({
                ...comment,
                body: written.comments[index] ?? comment.body,
              })),
            }
      }),
      versions: seed.versions.map((row) => ({ ...row, label: versionLabels[locale][row.id] ?? row.label })),
      activity: seed.activity.filter(isKept),
    },
    versionContent: demoVersionContent[locale],
  }
}
