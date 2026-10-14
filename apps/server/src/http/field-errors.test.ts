import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { toFieldErrors, type RequestPart } from './field-errors.ts'

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true })
addFormats.default(ajv)

function errorsFor(part: RequestPart, schema: object, data: unknown) {
  const validate = ajv.compile(schema)
  validate(data)
  return toFieldErrors(part, validate.errors ?? [])
}

const title = { type: 'string', minLength: 1, maxLength: 5 }
const document = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  minProperties: 2,
  properties: {
    title,
    revision: { type: 'integer', minimum: 1 },
    email: { type: 'string', format: 'email' },
    nickname: { oneOf: [title, { type: 'null' }] },
  },
  dependentRequired: { email: ['title'] },
}

describe('toFieldErrors', () => {
  const cases: readonly (readonly [string, unknown, { pointer: string; code: string }])[] = [
    ['a missing field', { revision: 1 }, { pointer: '/title', code: 'required' }],
    ['an empty text', { title: '' }, { pointer: '/title', code: 'too-short' }],
    ['a text over its maximum', { title: 'abcdef' }, { pointer: '/title', code: 'too-long' }],
    ['a value below its minimum', { title: 'a', revision: 0 }, { pointer: '/revision', code: 'invalid-value' }],
    ['a value of the wrong type', { title: 5 }, { pointer: '/title', code: 'invalid-value' }],
    ['a bad format', { title: 'a', email: 'nobody' }, { pointer: '/email', code: 'invalid-format' }],
    ['an unknown field', { title: 'a', surprise: 1 }, { pointer: '/surprise', code: 'unknown-field' }],
    ['a field that needs another', { email: 'a@b.example' }, { pointer: '/title', code: 'required' }],
    ['no field to change', { title: 'a' }, { pointer: '/', code: 'required' }],
    ['no alternative of a oneOf', { title: 'a', nickname: 7 }, { pointer: '/nickname', code: 'invalid-value' }],
  ]

  it.each(cases)('reports %s', (_name, body, expected) => {
    expect(errorsFor('body', document, body)).toContainEqual(expected)
  })

  it('reports a field once even when several rules fail', () => {
    const errors = errorsFor('body', { type: 'string', minLength: 3, pattern: '^[0-9]+$' }, 'a')

    expect(errors).toEqual([{ pointer: '/', code: 'too-short' }])
  })

  it('points into the query or the path for parameters', () => {
    const parameters = { type: 'object', properties: { limit: { type: 'integer', maximum: 100 } }, required: ['id'] }

    expect(errorsFor('query', parameters, { limit: 500, id: 'x' })).toEqual([
      { pointer: '/query/limit', code: 'invalid-value' },
    ])
    expect(errorsFor('path', parameters, {})).toEqual([{ pointer: '/path/id', code: 'required' }])
  })

  it('escapes the characters a JSON Pointer reserves', () => {
    const errors = errorsFor('body', { type: 'object', required: ['a/b~c'] }, {})

    expect(errors).toEqual([{ pointer: '/a~1b~0c', code: 'required' }])
  })
})
