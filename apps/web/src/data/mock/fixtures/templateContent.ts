import type { JSONContent } from '@tiptap/core'
import { bold, bulletList, heading, orderedList, paragraph } from './blocks.ts'

// The body of each template, as the server writes it into a new document (`apps/server/src/domain/templates`): the
// mock stands in for that server, so a document made from a template opens with its text.
// `templateContent.test.ts` holds the two copies together.

export const templateContent: Readonly<Record<'en' | 'es', Readonly<Record<string, readonly JSONContent[]>>>> = {
  en: {
    'meeting-notes': [
      paragraph(bold('Date: '), 'Add the date and who is in the room.'),
      heading(2, 'Agenda'),
      orderedList('Where we left off last time', 'The topic that needs a decision today', 'Anything blocking the team'),
      heading(2, 'Discussion'),
      paragraph('Capture the main points as they come up, and who raised them.'),
      heading(2, 'Decisions'),
      bulletList('What was decided, and why'),
      heading(2, 'Next steps'),
      bulletList([bold('Owner: '), 'the action, and the day it is due']),
    ],
    'project-brief': [
      heading(2, 'Goal'),
      paragraph('In one or two sentences: what do we want to achieve, and for whom?'),
      heading(2, 'Scope'),
      heading(3, 'In scope'),
      bulletList('The work we will do'),
      heading(3, 'Out of scope'),
      bulletList('What we are leaving for later'),
      heading(2, 'Timeline'),
      orderedList('Kick-off', 'First version ready for review', 'Launch'),
      heading(2, 'People'),
      paragraph(bold('Sponsor: '), 'who backs this project.'),
      paragraph(bold('Lead: '), 'who is accountable for the result.'),
      heading(2, 'Risks'),
      bulletList('What could go wrong, and what we will do about it'),
    ],
    'weekly-update': [
      heading(2, 'Highlights'),
      bulletList('The most important thing that moved forward'),
      heading(2, 'In progress'),
      bulletList('What is under way and who is on it'),
      heading(2, 'Blocked'),
      bulletList('What is stuck, and what would unblock it'),
      heading(2, 'Next week'),
      orderedList('The first priority', 'The second priority'),
    ],
  },
  es: {
    'meeting-notes': [
      paragraph(bold('Fecha: '), 'Anota la fecha y quién asiste.'),
      heading(2, 'Orden del día'),
      orderedList(
        'Dónde lo dejamos la última vez',
        'El tema que hoy necesita una decisión',
        'Lo que está frenando al equipo',
      ),
      heading(2, 'Conversación'),
      paragraph('Recoge los puntos principales según salgan y quién los planteó.'),
      heading(2, 'Decisiones'),
      bulletList('Qué se decidió y por qué'),
      heading(2, 'Próximos pasos'),
      bulletList([bold('Responsable: '), 'la acción y el día en que vence']),
    ],
    'project-brief': [
      heading(2, 'Objetivo'),
      paragraph('En una o dos frases: ¿qué queremos conseguir y para quién?'),
      heading(2, 'Alcance'),
      heading(3, 'Dentro del alcance'),
      bulletList('El trabajo que haremos'),
      heading(3, 'Fuera del alcance'),
      bulletList('Lo que dejamos para más adelante'),
      heading(2, 'Calendario'),
      orderedList('Arranque', 'Primera versión lista para revisar', 'Lanzamiento'),
      heading(2, 'Personas'),
      paragraph(bold('Patrocinio: '), 'quién respalda el proyecto.'),
      paragraph(bold('Responsable: '), 'quién responde del resultado.'),
      heading(2, 'Riesgos'),
      bulletList('Qué podría salir mal y qué haremos al respecto'),
    ],
    'weekly-update': [
      heading(2, 'Lo más destacado'),
      bulletList('Lo más importante que avanzó'),
      heading(2, 'En curso'),
      bulletList('Lo que está en marcha y quién lo lleva'),
      heading(2, 'Bloqueado'),
      bulletList('Lo que está atascado y qué lo desbloquearía'),
      heading(2, 'Próxima semana'),
      orderedList('La primera prioridad', 'La segunda prioridad'),
    ],
  },
}
