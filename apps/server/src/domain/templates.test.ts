import type { JSONContent } from '@tiptap/core'
import { yUpdateToJson } from '@draftroom/editor-schema/convert'
import { describe, expect, it } from 'vitest'
import { builtInTemplates } from './templates/built-in.ts'
import { InvalidTemplateError, loadTemplates, type TemplateSource, type TemplateSources } from './templates.ts'

const document = (text: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const source = (overrides: Partial<TemplateSource> = {}): TemplateSource => ({
  name: 'Notes',
  description: 'Notes of a meeting.',
  content: document('Hello'),
  ...overrides,
})
const sources = (en: TemplateSource, es: TemplateSource = en): TemplateSources => ({
  en: { notes: en },
  es: { notes: es },
})

describe('loading the templates', () => {
  it('keeps each template in each language, by id, with the Yjs state of its content', () => {
    const catalog = loadTemplates(sources(source(), source({ name: 'Notas', content: document('Hola') })))

    expect(catalog.list('en').map(({ id, name }) => ({ id, name }))).toEqual([{ id: 'notes', name: 'Notes' }])
    expect(yUpdateToJson(catalog.find('es', 'notes')?.state ?? new Uint8Array())).toEqual(document('Hola'))
    expect(catalog.find('en', 'unknown')).toBeUndefined()
  })

  it('lists the templates by id ascending', () => {
    const both = { name: 'A', description: 'B', content: document('x') }
    const catalog = loadTemplates({
      en: { weekly: both, agenda: both },
      es: { weekly: both, agenda: both },
    })

    expect(catalog.list('es').map(({ id }) => id)).toEqual(['agenda', 'weekly'])
  })

  const invalid: readonly [string, TemplateSources][] = [
    ['a node the schema does not have', sources(source({ content: { type: 'doc', content: [{ type: 'table' }] } }))],
    [
      'text straight in the document',
      sources(source({ content: { type: 'doc', content: [{ type: 'text', text: 'a' }] } })),
    ],
    [
      'a heading of a level the schema does not have',
      sources(
        source({
          content: {
            type: 'doc',
            content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'a' }] }],
          },
        }),
      ),
    ],
    ['a name longer than the contract allows', sources(source({ name: 'n'.repeat(101) }))],
    ['an empty description', sources(source({ description: '' }))],
    ['a language that lacks a template', { en: { notes: source() }, es: {} }],
    ['an id the contract does not allow', { en: { 'Not Valid': source() }, es: { 'Not Valid': source() } }],
  ]
  it.each(invalid)('refuses %s, so that the server does not start', (_reason, input) => {
    expect(() => loadTemplates(input)).toThrow(InvalidTemplateError)
  })
})

describe('the built-in templates', () => {
  it('are the same in English and Spanish', () => {
    expect(builtInTemplates.list('es').map(({ id }) => id)).toEqual(builtInTemplates.list('en').map(({ id }) => id))
  })

  it('are between three and five', () => {
    expect(builtInTemplates.list('en').length).toBeGreaterThanOrEqual(3)
    expect(builtInTemplates.list('en').length).toBeLessThanOrEqual(5)
  })
})
