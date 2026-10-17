import type { JSONContent } from '@tiptap/core'
import type { Locale } from '../../../i18n/locale.ts'
import { bold, bulletList, heading, orderedList, paragraph } from './blocks.ts'
import {
  brandVoice,
  budget,
  designReview,
  interviews,
  interviewsSpanish,
  launchPlan,
  oldPricing,
  oldPricingSpanish,
  onboardingChecklist,
  onboardingGuide,
  weeklyEnglish,
  weeklySpanish,
} from './documents.ts'

// What the documents of the demo hold when someone opens them, in the language the demo started in: the people of the
// fixtures write in both, and the content of a document follows the visitor, not the title it was given.
//
// The two documents a collaborator writes in (`scriptedCollaborators.ts`) end with a paragraph of plain text. It is the
// one she adds to and deletes from, so it reads as a line that is still being worked on.
// A document with a stored version continues the last of them (`versionContent.ts`).

type Blocks = readonly JSONContent[]

export const demoContent: Readonly<Record<Locale, Readonly<Record<string, Blocks>>>> = {
  en: {
    [launchPlan.id]: [
      heading(2, 'Autumn launch plan'),
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
      heading(2, 'Design review notes'),
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
    [weeklySpanish.id]: [
      heading(2, 'Highlights'),
      bulletList('The welcome emails are active and the first replies are in.'),
      heading(2, 'In progress'),
      bulletList('Moving billing to the new provider.', 'A short guide for new teammates.'),
      heading(2, 'Blocked'),
      bulletList('Finance still has to choose the invoicing schedule.'),
      heading(2, 'Next week'),
      orderedList('Agree the invoicing schedule.', 'Send the guide to the team.'),
    ],
    [interviews.id]: [
      heading(2, 'Customer interview synthesis'),
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
    [interviewsSpanish.id]: [
      heading(2, 'Interview synthesis, second round'),
      paragraph('Five interviews with teams of fewer than ten people.'),
      heading(2, 'What we heard'),
      bulletList(
        'Small teams share one folder and trust whoever created it.',
        'Comments matter more than suggestions: a question beside the sentence it is about.',
      ),
      heading(2, 'What we do next'),
      orderedList('Compare both rounds.', 'Share the synthesis with the whole team.'),
    ],
    [brandVoice.id]: [
      heading(2, 'Brand voice guide'),
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
      heading(2, '2027 budget'),
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
    [onboardingGuide.id]: [
      heading(2, 'Welcome to Harbor Pine'),
      paragraph('This guide has what you need for your first week: accounts, equipment and who to talk to.'),
      heading(2, 'Your first week'),
      orderedList('Sign in and check your accounts.', 'Pick up your equipment.', 'Meet the three people on your list.'),
    ],
    [oldPricing.id]: [
      heading(2, 'Old pricing draft'),
      paragraph('Three tiers, with a free plan that we dropped after the first review.'),
      bulletList(
        'Free: one workspace and five documents.',
        'Team: unlimited documents.',
        'Business: history and sharing controls.',
      ),
    ],
    [oldPricingSpanish.id]: [
      heading(2, 'Previous pricing draft'),
      paragraph('The first idea for the tiers, kept for reference.'),
      bulletList('A free plan, later removed.', 'A team plan with unlimited documents.'),
    ],
  },
  es: {
    [launchPlan.id]: [
      heading(2, 'Plan de lanzamiento de otoño'),
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
      heading(2, 'Notas de la revisión de diseño'),
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
    [weeklySpanish.id]: [
      heading(2, 'Lo más destacado'),
      bulletList('Los correos de bienvenida ya están activos y han llegado las primeras respuestas.'),
      heading(2, 'En marcha'),
      bulletList('El paso de la facturación al nuevo proveedor.', 'Una guía breve para quien se incorpora.'),
      heading(2, 'Bloqueado'),
      bulletList('Finanzas todavía tiene que elegir el calendario de facturación.'),
      heading(2, 'La semana que viene'),
      orderedList('Acordar el calendario de facturación.', 'Enviar la guía al equipo.'),
    ],
    [interviews.id]: [
      heading(2, 'Síntesis de entrevistas con clientes'),
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
    [interviewsSpanish.id]: [
      heading(2, 'Síntesis de entrevistas con clientes'),
      paragraph('Cinco entrevistas con equipos de menos de diez personas.'),
      heading(2, 'Lo que escuchamos'),
      bulletList(
        'Los equipos pequeños comparten una carpeta y se fían de quien la creó.',
        'Importan más los comentarios que las sugerencias: una pregunta junto a la frase de la que habla.',
      ),
      heading(2, 'Lo que haremos'),
      orderedList('Comparar las dos rondas.', 'Compartir la síntesis con todo el equipo.'),
    ],
    [brandVoice.id]: [
      heading(2, 'Guía de voz de marca'),
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
      heading(2, 'Presupuesto 2027'),
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
    [onboardingGuide.id]: [
      heading(2, 'Te damos la bienvenida a Harbor Pine'),
      paragraph('Esta guía reúne lo que necesitas para tu primera semana: cuentas, equipo y con quién hablar.'),
      heading(2, 'Tu primera semana'),
      orderedList('Entra y comprueba tus cuentas.', 'Recoge tu equipo.', 'Conoce a las tres personas de tu lista.'),
    ],
    [oldPricing.id]: [
      heading(2, 'Borrador de precios anterior'),
      paragraph('Tres tarifas, con un plan gratuito que descartamos tras la primera revisión.'),
      bulletList(
        'Gratis: un espacio de trabajo y cinco documentos.',
        'Equipo: documentos ilimitados.',
        'Empresa: historial y control del uso compartido.',
      ),
    ],
    [oldPricingSpanish.id]: [
      heading(2, 'Borrador de precios anterior'),
      paragraph('La primera idea de las tarifas, guardada como referencia.'),
      bulletList('Un plan gratuito, que se quitó después.', 'Un plan de equipo con documentos ilimitados.'),
    ],
  },
}
