import type { JSONContent } from '@tiptap/core'
import { jsonToYUpdate } from '@draftroom/editor-schema/convert'
import { excerptOf } from './excerpt.ts'

export type TemplateLocale = 'en' | 'es'

/** A template as the product writes it: the words that name it and the document it starts. */
export interface TemplateSource {
  readonly name: string
  readonly description: string
  readonly content: JSONContent
}

export type TemplateSources = Readonly<Record<TemplateLocale, Readonly<Record<string, TemplateSource>>>>

export interface Template {
  readonly id: string
  readonly name: string
  readonly description: string
  /** The Yjs update to store as the state of a document that starts from this template. */
  readonly state: Uint8Array
  /** What a document that starts from it shows in lists, so it is not blank until its first edit. */
  readonly excerpt: string | null
}

export interface TemplateCatalog {
  /** The templates in `locale`, by `id` ascending. */
  list(locale: TemplateLocale): readonly Template[]
  find(locale: TemplateLocale, id: string): Template | undefined
}

// The contract's limits for a template: a catalog that broke them would turn `listTemplates` into a 500 at request time.
const idPattern = /^[a-z0-9-]{1,64}$/
const nameLength = 100
const descriptionLength = 300

const locales: readonly TemplateLocale[] = ['en', 'es']

/** A template that the contract or the editor schema would refuse. Thrown while the catalog is built, never per request. */
export class InvalidTemplateError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidTemplateError'
  }
}

function check(locale: TemplateLocale, id: string, { name, description }: TemplateSource): void {
  const fail = (reason: string): never => {
    throw new InvalidTemplateError(`Template "${id}" (${locale}): ${reason}.`)
  }
  if (!idPattern.test(id)) fail('the id does not match the contract')
  if (name.length < 1 || name.length > nameLength) fail(`the name must have 1 to ${nameLength} characters`)
  if (description.length < 1 || description.length > descriptionLength) {
    fail(`the description must have 1 to ${descriptionLength} characters`)
  }
}

/**
 * Builds the catalog from the sources, converting each document to its Yjs state once. It refuses a template the
 * contract or the editor schema would refuse, and a language that lacks a template another has, so that a template
 * drifting from the schema stops the server from starting instead of failing the first person who picks it.
 */
export function loadTemplates(sources: TemplateSources): TemplateCatalog {
  const ids = Object.keys(sources.en).sort()
  for (const locale of locales) {
    const own = Object.keys(sources[locale]).sort()
    if (own.length !== ids.length || own.some((id, index) => id !== ids[index])) {
      throw new InvalidTemplateError(`The templates in "${locale}" are not the same as in "en".`)
    }
  }

  const byLocale = new Map<TemplateLocale, readonly Template[]>()
  for (const locale of locales) {
    byLocale.set(
      locale,
      ids.map((id) => {
        const source = sources[locale][id]
        if (source === undefined) throw new InvalidTemplateError(`Template "${id}" (${locale}) is missing.`)
        check(locale, id, source)
        try {
          return {
            id,
            name: source.name,
            description: source.description,
            state: jsonToYUpdate(source.content),
            excerpt: excerptOf(source.content),
          }
        } catch (cause) {
          throw new InvalidTemplateError(`Template "${id}" (${locale}): its content is not a document of the schema.`, {
            cause,
          })
        }
      }),
    )
  }

  const list = (locale: TemplateLocale): readonly Template[] => byLocale.get(locale) ?? []
  return { list, find: (locale, id) => list(locale).find((template) => template.id === id) }
}
