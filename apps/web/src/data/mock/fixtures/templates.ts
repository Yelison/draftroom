export interface TemplateRecord {
  id: string
  /** The words people read, by language: templates are product content, not user content. */
  text: Record<'en' | 'es', { name: string; description: string; excerpt: string }>
}

export const templates: readonly TemplateRecord[] = [
  {
    id: 'meeting-notes',
    text: {
      en: {
        name: 'Meeting notes',
        description: 'Agenda, decisions and who does what next.',
        excerpt: 'Agenda, decisions and next steps.',
      },
      es: {
        name: 'Notas de reunión',
        description: 'Orden del día, decisiones y quién hace qué después.',
        excerpt: 'Orden del día, decisiones y próximos pasos.',
      },
    },
  },
  {
    id: 'project-brief',
    text: {
      en: {
        name: 'Project brief',
        description: 'Goal, scope and timeline on one page.',
        excerpt: 'What we want to achieve, what is in and what is out.',
      },
      es: {
        name: 'Resumen de proyecto',
        description: 'Objetivo, alcance y calendario en una página.',
        excerpt: 'Qué queremos conseguir, qué entra y qué queda fuera.',
      },
    },
  },
  {
    id: 'weekly-update',
    text: {
      en: {
        name: 'Weekly update',
        description: 'What moved this week and what is blocked.',
        excerpt: 'What moved this week, what is blocked and what comes next.',
      },
      es: {
        name: 'Actualización semanal',
        description: 'Qué avanzó esta semana y qué está bloqueado.',
        excerpt: 'Qué avanzó esta semana, qué está bloqueado y qué viene después.',
      },
    },
  },
]
