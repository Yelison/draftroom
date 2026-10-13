import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { z } from 'zod'

// Support for the contract tests: reads openapi.yaml and exposes only what they assert on. Fields the tests look at
// are optional here, so a broken contract fails the one test about it instead of every test at load time.

const methods = ['get', 'put', 'post', 'delete', 'patch'] as const
export type HttpMethod = (typeof methods)[number]

const reference = z.object({ $ref: z.string() })
const securityRequirement = z.record(z.string(), z.array(z.string()))

const rolesRule = z.object({ row: z.string(), roles: z.array(z.string()), condition: z.string().optional() })
const access = z.object({ scope: z.string(), rules: z.array(rolesRule).optional() })

const media = z.looseObject({
  schema: z.unknown().optional(),
  example: z.unknown().optional(),
  examples: z.unknown().optional(),
})
const content = z.record(z.string(), media)
const response = z.looseObject({ content: content.optional() })

const parameter = z.looseObject({
  name: z.string().optional(),
  in: z.string().optional(),
  schema: z.unknown().optional(),
})

const operation = z.looseObject({
  operationId: z.string().optional(),
  security: z.array(securityRequirement).optional(),
  parameters: z.array(z.union([reference, parameter])).optional(),
  requestBody: z.looseObject({ content: content.optional() }).optional(),
  responses: z.record(z.string(), z.union([reference, response])).optional(),
  'x-draftroom-roles': access.optional(),
})

const schemaNode = z.looseObject({
  type: z.unknown().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  default: z.unknown().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
  enum: z.array(z.unknown()).optional(),
})

const documentShape = z.looseObject({
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
  components: z.looseObject({
    schemas: z.record(z.string(), schemaNode),
    parameters: z.record(z.string(), parameter),
    responses: z.record(z.string(), response),
    securitySchemes: z.record(z.string(), z.looseObject({})),
  }),
})

export type Access = z.infer<typeof access>
export type SchemaNode = z.infer<typeof schemaNode>
type Response = z.infer<typeof response>
type Reference = z.infer<typeof reference>

export interface OpenApiDocument {
  /** The parsed document, for tests that walk it as plain data. */
  readonly raw: unknown
  readonly operations: readonly Operation[]
  readonly schemas: Readonly<Record<string, SchemaNode>>
  readonly parameters: Readonly<Record<string, z.infer<typeof parameter>>>
  readonly securitySchemes: Readonly<Record<string, Record<string, unknown>>>
  /** Follows a `$ref` into `components`; anything that is not a reference comes back unchanged. */
  resolveResponse(candidate: Reference | Response): Response
  /** The name a `$ref` such as `#/components/schemas/Id` points at, or `undefined` for anything else. */
  referencedName(node: unknown): string | undefined
}

export interface Operation {
  readonly method: HttpMethod
  readonly path: string
  /** `GET /api/me`, the form the plan's table uses. */
  readonly key: string
  readonly id: string | undefined
  readonly security: z.infer<typeof securityRequirement>[] | undefined
  readonly parameters: readonly (Reference | z.infer<typeof parameter>)[]
  readonly requestBody: { content?: z.infer<typeof content> | undefined } | undefined
  readonly responses: Readonly<Record<string, Reference | Response>>
  readonly access: Access | undefined
}

const responsesPrefix = '#/components/responses/'

function isReference(node: unknown): node is Reference {
  return reference.safeParse(node).success
}

export function loadOpenApi(): OpenApiDocument {
  const raw: unknown = parse(readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'))
  const document = documentShape.parse(raw)

  const operations = Object.entries(document.paths).flatMap(([path, item]) =>
    methods.flatMap((method) => {
      const node = item[method]
      if (node === undefined) return []
      const parsed = operation.parse(node)
      return [
        {
          method,
          path,
          key: `${method.toUpperCase()} ${path}`,
          id: parsed.operationId,
          security: parsed.security,
          parameters: parsed.parameters ?? [],
          requestBody: parsed.requestBody,
          responses: parsed.responses ?? {},
          access: parsed['x-draftroom-roles'],
        },
      ]
    }),
  )

  return {
    raw,
    operations,
    schemas: document.components.schemas,
    parameters: document.components.parameters,
    securitySchemes: document.components.securitySchemes,
    resolveResponse(candidate) {
      if (!isReference(candidate)) return candidate
      const resolved = candidate.$ref.startsWith(responsesPrefix)
        ? document.components.responses[candidate.$ref.slice(responsesPrefix.length)]
        : undefined
      if (resolved === undefined) throw new Error(`Unresolved response reference ${candidate.$ref}`)
      return resolved
    },
    referencedName(node) {
      const parsed = reference.safeParse(node)
      return parsed.success ? parsed.data.$ref.slice(parsed.data.$ref.lastIndexOf('/') + 1) : undefined
    },
  }
}

/** Reads any node of the document as a schema, for tests that follow a `$ref` themselves. */
export function asSchema(node: unknown): SchemaNode {
  return schemaNode.parse(node)
}
