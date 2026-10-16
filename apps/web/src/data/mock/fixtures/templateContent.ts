import type { JSONContent } from '@tiptap/core'

// The body of each template, as the server writes it into a new document (`apps/server/src/domain/templates`): the mock
// stands in for that server, so a document made from a template opens with its text. `templateContent.test.ts` holds the
// two copies together.

const text = (value: string, marks?: readonly string[]): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks === undefined ? {} : { marks: marks.map((type) => ({ type })) }),
})
const p = (...parts: (string | JSONContent)[]): JSONContent => ({
  type: 'paragraph',
  content: parts.map((part) => (typeof part === 'string' ? text(part) : part)),
})
const h = (level: 2 | 3, value: string): JSONContent => ({ type: 'heading', attrs: { level }, content: [text(value)] })
type Item = string | JSONContent | readonly (string | JSONContent)[]
const items = (type: 'bulletList' | 'orderedList', rows: Item[]): JSONContent => ({
  type,
  content: rows.map((row) => ({ type: 'listItem', content: [p(...(Array.isArray(row) ? row : [row]))] })),
})
const ul = (...rows: Item[]) => items('bulletList', rows)
const ol = (...rows: Item[]) => items('orderedList', rows)
const b = (value: string) => text(value, ['bold'])

export const templateContent: Readonly<Record<'en' | 'es', Readonly<Record<string, readonly JSONContent[]>>>> = {
  en: {
    'meeting-notes': [
      p(b('Date: '), 'Add the date and who is in the room.'),
      h(2, 'Agenda'),
      ol('Where we left off last time', 'The topic that needs a decision today', 'Anything blocking the team'),
      h(2, 'Discussion'),
      p('Capture the main points as they come up, and who raised them.'),
      h(2, 'Decisions'),
      ul('What was decided, and why'),
      h(2, 'Next steps'),
      ul([b('Owner: '), 'the action, and the day it is due']),
    ],
    'project-brief': [
      h(2, 'Goal'),
      p('In one or two sentences: what do we want to achieve, and for whom?'),
      h(2, 'Scope'),
      h(3, 'In scope'),
      ul('The work we will do'),
      h(3, 'Out of scope'),
      ul('What we are leaving for later'),
      h(2, 'Timeline'),
      ol('Kick-off', 'First version ready for review', 'Launch'),
      h(2, 'People'),
      p(b('Sponsor: '), 'who backs this project.'),
      p(b('Lead: '), 'who is accountable for the result.'),
      h(2, 'Risks'),
      ul('What could go wrong, and what we will do about it'),
    ],
    'weekly-update': [
      h(2, 'Highlights'),
      ul('The most important thing that moved forward'),
      h(2, 'In progress'),
      ul('What is under way and who is on it'),
      h(2, 'Blocked'),
      ul('What is stuck, and what would unblock it'),
      h(2, 'Next week'),
      ol('The first priority', 'The second priority'),
    ],
  },
  es: {
    'meeting-notes': [
      p(b('Fecha: '), 'Anota la fecha y quién asiste.'),
      h(2, 'Orden del día'),
      ol('Dónde lo dejamos la última vez', 'El tema que hoy necesita una decisión', 'Lo que está frenando al equipo'),
      h(2, 'Conversación'),
      p('Recoge los puntos principales según salgan y quién los planteó.'),
      h(2, 'Decisiones'),
      ul('Qué se decidió y por qué'),
      h(2, 'Próximos pasos'),
      ul([b('Responsable: '), 'la acción y el día en que vence']),
    ],
    'project-brief': [
      h(2, 'Objetivo'),
      p('En una o dos frases: ¿qué queremos conseguir y para quién?'),
      h(2, 'Alcance'),
      h(3, 'Dentro del alcance'),
      ul('El trabajo que haremos'),
      h(3, 'Fuera del alcance'),
      ul('Lo que dejamos para más adelante'),
      h(2, 'Calendario'),
      ol('Arranque', 'Primera versión lista para revisar', 'Lanzamiento'),
      h(2, 'Personas'),
      p(b('Patrocinio: '), 'quién respalda el proyecto.'),
      p(b('Responsable: '), 'quién responde del resultado.'),
      h(2, 'Riesgos'),
      ul('Qué podría salir mal y qué haremos al respecto'),
    ],
    'weekly-update': [
      h(2, 'Lo más destacado'),
      ul('Lo más importante que avanzó'),
      h(2, 'En curso'),
      ul('Lo que está en marcha y quién lo lleva'),
      h(2, 'Bloqueado'),
      ul('Lo que está atascado y qué lo desbloquearía'),
      h(2, 'Próxima semana'),
      ol('La primera prioridad', 'La segunda prioridad'),
    ],
  },
}
