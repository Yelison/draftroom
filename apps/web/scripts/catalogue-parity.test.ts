import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import es from '../src/i18n/es.json'
import { catalogueProblems } from './catalogue-parity.ts'

const source = (messages: Record<string, unknown>) => ({ file: 'en.json', messages })
const translation = (messages: Record<string, unknown>) => ({ file: 'es.json', messages })

describe('the shipped catalogues', () => {
  it('agree in keys and in the arguments of every message', () => {
    expect(catalogueProblems({ file: 'en.json', messages: en }, { file: 'es.json', messages: es })).toEqual([])
  })
})

interface Row {
  case: string
  english: Record<string, unknown>
  spanish: Record<string, unknown>
  problem: string
}

describe('catalogueProblems', () => {
  it.each<Row>([
    {
      case: 'a key the translation lacks that Object.prototype has',
      english: { constructor: 'A' },
      spanish: {},
      problem: 'es.json: missing "constructor"',
    },
    {
      case: 'a key only the translation has that Object.prototype has',
      english: {},
      spanish: { constructor: 'A' },
      problem: 'es.json: "constructor" is not in en.json',
    },
    {
      case: 'a key the translation lacks',
      english: { a: 'A', b: 'B' },
      spanish: { a: 'A' },
      problem: 'es.json: missing "b"',
    },
    {
      case: 'a key only the translation has',
      english: { a: 'A' },
      spanish: { a: 'A', extra: 'X' },
      problem: 'es.json: "extra" is not in en.json',
    },
    {
      case: 'an argument the translation lost',
      english: { a: 'Hello {name}' },
      spanish: { a: 'Hola' },
      problem: 'es.json: "a" uses none, but en.json uses name',
    },
    {
      case: 'an argument that was renamed',
      english: { a: 'Hello {name}' },
      spanish: { a: 'Hola {nombre}' },
      problem: 'es.json: "a" uses nombre, but en.json uses name',
    },
    {
      case: 'an argument inside a plural branch that was lost',
      english: { a: '{count, plural, one {# file by {owner}} other {# files by {owner}}}' },
      spanish: { a: '{count, plural, one {# archivo} other {# archivos}}' },
      problem: 'es.json: "a" uses count, but en.json uses count, owner',
    },
    {
      case: 'a message that is not valid ICU',
      english: { a: 'A' },
      spanish: { a: 'Hola {nombre' },
      problem: 'es.json: "a" is not valid ICU',
    },
    {
      case: 'a message that is not a string',
      english: { a: 'A' },
      spanish: { a: 3 },
      problem: 'es.json: "a" is not a string',
    },
  ])('reports $case', ({ english, spanish, problem }) => {
    expect(catalogueProblems(source(english), translation(spanish))).toContain(problem)
  })

  it('accepts translations that reorder arguments and branches', () => {
    const english = { a: '{count, plural, one {# note by {owner}} other {# notes by {owner}}}' }
    const spanish = { a: '{count, plural, one {# nota de {owner}} other {# notas de {owner}}}' }

    expect(catalogueProblems(source(english), translation(spanish))).toEqual([])
  })
})
