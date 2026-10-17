import type { JSONContent } from '@tiptap/core'
import type { Locale } from '../../../i18n/locale.ts'
import { bold, bulletList, heading, orderedList, paragraph } from './blocks.ts'
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

// What the documents of the demo hold when someone opens them, in the language the demo started in (`demoSeed.ts` gives
// the world its titles in the same language). The title of a document is shown above its text, so the text does not
// repeat it as a heading.
//
// The two documents a collaborator writes in (`collaboratorScripts.ts`) end with a paragraph of plain text. It is the
// one she adds to and deletes from, so it reads as a line that is still being worked on.
// The last stored version of a document is taken from the beginning of its text (`demoVersionContent.ts`), so the text
// continues it.

type Blocks = readonly JSONContent[]

export const demoContent: Readonly<Record<Locale, Readonly<Record<string, Blocks>>>> = {
  en: {
    [launchPlan.id]: [
      paragraph('The launch moves to the second week of November, once the pricing review is signed off.'),
      paragraph('Marketing prepares the announcement and support gets the new tiers a week earlier.'),
      heading(2, 'Who does what'),
      bulletList(
        'Marta owns the plan and signs off the date.',
        'Daniel prepares the pricing page and the comparison table.',
        'Sofía writes the onboarding emails for the new tiers.',
      ),
      heading(2, 'Open points'),
      paragraph('Still open after the pricing review:'),
    ],
    [designReview.id]: [
      paragraph('We agreed to simplify the sidebar and keep the language selector in settings.'),
      heading(2, 'Decisions'),
      bulletList(
        'The sidebar keeps three entries: documents, shared with me and the trash.',
        'The language selector lives in settings, next to the theme.',
        'Comments open beside the text and never cover it.',
      ),
      heading(2, 'Follow-ups'),
      orderedList('Daniel updates the explorer before Friday.', 'Marta checks the new layout at 1280 pixels wide.'),
    ],
    [weeklyEnglish.id]: [
      heading(2, 'Highlights'),
      bulletList('Onboarding emails are live and the first customers have received them.'),
      heading(2, 'In progress'),
      bulletList('The billing migration, with Sofía and Daniel.', 'The new pricing page, waiting for copy.'),
      heading(2, 'Blocked'),
      bulletList('The billing migration is waiting on one decision from finance.'),
      heading(2, 'Next week'),
      orderedList('Close the billing decision.', 'Publish the pricing page.'),
    ],
    [interviews.id]: [
      paragraph('Eight interviews, three themes: onboarding, sharing and the cost of switching.'),
      heading(2, 'What we heard'),
      bulletList(
        [bold('Notes: '), 'teams keep them in three places, and nobody trusts the one meant to be the source.'],
        [bold('Sharing: '), 'people want to send a link and know exactly who can open it.'],
        [bold('Switching: '), 'moving a year of documents is the fear, more than the price.'],
      ),
      heading(2, 'What we do next'),
      orderedList('Bring the interview quotes to the launch plan.', 'Ask three more teams about sharing.'),
    ],
    [brandVoice.id]: [
      paragraph('We write the way we talk to a colleague: short sentences, no jargon, a little warmth.'),
      heading(2, 'How we sound'),
      bulletList(
        'Plain words first: “open”, not “access”.',
        'One idea per sentence, and the verb early.',
        'Warm, never chatty: we say thanks once.',
      ),
      heading(2, 'Examples to add'),
      paragraph('Examples we still want to add:'),
    ],
    [budget.id]: [
      paragraph('Hiring, tools and travel assumptions for next year.'),
      heading(2, 'Hiring'),
      bulletList('One designer and one engineer, from March.', 'A part-time support role from September.'),
      heading(2, 'Tools and travel'),
      bulletList(
        'Keep the current tools and review the licences in June.',
        'Two team meetups, one in spring and one in autumn.',
      ),
    ],
    [onboardingChecklist.id]: [
      heading(2, 'Before the first day'),
      bulletList('Create the accounts for email, documents and chat.', 'Prepare the laptop and the badge.'),
      heading(2, 'The first week'),
      orderedList('Meet your team lead.', 'Meet the person who will be your buddy.', 'Meet someone from support.'),
      paragraph('Ask your buddy anything: no question is too small.'),
    ],
    [oldPricing.id]: [
      paragraph('Three tiers, with a free plan that we dropped after the first review.'),
      bulletList(
        'Free: one workspace and five documents.',
        'Team: unlimited documents.',
        'Business: history and sharing controls.',
      ),
    ],
  },
  es: {
    [launchPlan.id]: [
      paragraph('El lanzamiento pasa a la segunda semana de noviembre, cuando se apruebe la revisión de precios.'),
      paragraph('Marketing prepara el anuncio y soporte recibe las nuevas tarifas una semana antes.'),
      heading(2, 'Quién hace qué'),
      bulletList(
        'Marta responde del plan y confirma la fecha.',
        'Daniel prepara la página de precios y la tabla comparativa.',
        'Sofía escribe los correos de bienvenida para las nuevas tarifas.',
      ),
      heading(2, 'Puntos abiertos'),
      paragraph('Sigue abierto tras la revisión de precios:'),
    ],
    [designReview.id]: [
      paragraph('Acordamos simplificar la barra lateral y dejar el selector de idioma en los ajustes.'),
      heading(2, 'Decisiones'),
      bulletList(
        'La barra lateral conserva tres entradas: documentos, compartidos conmigo y papelera.',
        'El selector de idioma vive en los ajustes, junto al tema.',
        'Los comentarios se abren junto al texto y nunca lo tapan.',
      ),
      heading(2, 'Siguientes pasos'),
      orderedList(
        'Daniel actualiza el explorador antes del viernes.',
        'Marta revisa el nuevo diseño a 1280 píxeles de ancho.',
      ),
    ],
    [weeklyEnglish.id]: [
      heading(2, 'Lo más destacado'),
      bulletList('Los correos de bienvenida están activos y los primeros clientes ya los han recibido.'),
      heading(2, 'En marcha'),
      bulletList(
        'La migración de facturación, con Sofía y Daniel.',
        'La nueva página de precios, a la espera de los textos.',
      ),
      heading(2, 'Bloqueado'),
      bulletList('La migración de facturación espera una decisión de finanzas.'),
      heading(2, 'La semana que viene'),
      orderedList('Cerrar la decisión de facturación.', 'Publicar la página de precios.'),
    ],
    [interviews.id]: [
      paragraph('Ocho entrevistas, tres temas: la primera vez, compartir y lo que cuesta cambiar de herramienta.'),
      heading(2, 'Lo que escuchamos'),
      bulletList(
        [bold('Notas: '), 'los equipos las guardan en tres sitios y nadie se fía del que debería ser la fuente.'],
        [bold('Compartir: '), 'quieren enviar un enlace y saber exactamente quién puede abrirlo.'],
        [bold('Cambiar: '), 'el miedo es mover un año de documentos, más que el precio.'],
      ),
      heading(2, 'Lo que haremos'),
      orderedList(
        'Llevar las citas de las entrevistas al plan de lanzamiento.',
        'Preguntar a tres equipos más sobre compartir.',
      ),
    ],
    [brandVoice.id]: [
      paragraph('Escribimos como hablamos con un compañero: frases cortas, sin jerga y con un poco de calidez.'),
      heading(2, 'Cómo sonamos'),
      bulletList(
        'Primero la palabra sencilla: «abrir», no «acceder».',
        'Una idea por frase y el verbo pronto.',
        'Cercanos, nunca charlatanes: damos las gracias una vez.',
      ),
      heading(2, 'Ejemplos por añadir'),
      paragraph('Ejemplos que todavía queremos añadir:'),
    ],
    [budget.id]: [
      paragraph('Hipótesis de contratación, herramientas y viajes para el próximo año.'),
      heading(2, 'Contratación'),
      bulletList(
        'Una persona de diseño y otra de ingeniería, desde marzo.',
        'Un puesto de soporte a media jornada desde septiembre.',
      ),
      heading(2, 'Herramientas y viajes'),
      bulletList(
        'Mantener las herramientas actuales y revisar las licencias en junio.',
        'Dos encuentros de equipo, uno en primavera y otro en otoño.',
      ),
    ],
    [onboardingChecklist.id]: [
      heading(2, 'Antes del primer día'),
      bulletList('Crear las cuentas de correo, documentos y chat.', 'Preparar el portátil y la tarjeta de acceso.'),
      heading(2, 'La primera semana'),
      orderedList(
        'Conocer a tu responsable.',
        'Conocer a la persona que te acompañará.',
        'Conocer a alguien de soporte.',
      ),
      paragraph('Pregunta lo que necesites a quien te acompañe: ninguna duda es pequeña.'),
    ],
    [oldPricing.id]: [
      paragraph('Tres tarifas, con un plan gratuito que descartamos tras la primera revisión.'),
      bulletList(
        'Gratis: un espacio de trabajo y cinco documentos.',
        'Equipo: documentos ilimitados.',
        'Empresa: historial y control del uso compartido.',
      ),
    ],
  },
}
