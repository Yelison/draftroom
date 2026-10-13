import { describe, expect, it } from 'vitest'
import { loadOpenApi } from './document.ts'

const { operations, raw, schemas } = loadOpenApi()

const isRecord = (node: unknown): node is Record<string, unknown> =>
  typeof node === 'object' && node !== null && !Array.isArray(node)

/** Every object node below `node`, with the path that leads to it. */
function* objectsIn(node: unknown, path: string): Generator<[string, Record<string, unknown>]> {
  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) yield* objectsIn(child, `${path}/${index}`)
  } else if (isRecord(node)) {
    yield [path, node]
    for (const [key, child] of Object.entries(node)) yield* objectsIn(child, `${path}/${key}`)
  }
}

describe('schemas', () => {
  // A response with a property the contract does not name would pass a validator that tolerates extras.
  it('close every object so unknown properties are refused', () => {
    const open = Object.entries(schemas).flatMap(([name, schema]) =>
      [...objectsIn(schema, name)]
        .filter(([, node]) => node['type'] === 'object' && node['additionalProperties'] !== false)
        .map(([path]) => path),
    )

    expect(open).toEqual([])
  })

  // OpenAPI 3.1 dropped `nullable`: a validator for 3.1 ignores it and lets null through nowhere.
  it('write nullability as a type, never as the 3.0 nullable keyword', () => {
    const legacy = [...objectsIn(raw, '')].filter(([, node]) => 'nullable' in node).map(([path]) => path)

    expect(legacy).toEqual([])
  })

  it('give every JSON body of every operation an example', () => {
    const missing = operations.flatMap((operation) => {
      const bodies = [
        ...Object.entries(operation.requestBody?.content ?? {}).map(
          ([type, media]) => [`${operation.id} request`, type, media] as const,
        ),
        ...Object.entries(operation.responses).flatMap(([status, candidate]) =>
          '$ref' in candidate
            ? []
            : Object.entries(candidate.content ?? {}).map(
                ([type, media]) => [`${operation.id} ${status}`, type, media] as const,
              ),
        ),
      ]
      return bodies
        .filter(([, type]) => type === 'application/json')
        .filter(([, , media]) => media.example === undefined && media.examples === undefined)
        .map(([where]) => where)
    })

    expect(missing).toEqual([])
  })

  // A document the caller does not own shows no general access, in the examples too: they are what mocks copy.
  it('show no general access in the examples of documents the caller does not own', () => {
    const documents = [...objectsIn(raw, '')].filter(
      ([path, node]) =>
        !path.startsWith('/components/schemas') && 'generalAccess' in node && 'workspaceId' in node && 'role' in node,
    )
    const leaking = documents.filter(([, node]) => node['role'] !== 'owner' && node['generalAccess'] !== null)

    expect({ documents: documents.length > 0, leaking: leaking.map(([path]) => path) }).toEqual({
      documents: true,
      leaking: [],
    })
  })
})
