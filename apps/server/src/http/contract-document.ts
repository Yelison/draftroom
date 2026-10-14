import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { z } from 'zod'

// The slice of openapi.yaml the server reads. Everything else in the file (descriptions, examples, tags) is not its
// business, and schemas stay opaque here: Ajv is what understands them.

export const reference = z.object({ $ref: z.string() })
export type Reference = z.infer<typeof reference>

const parameter = z.object({
  name: z.string(),
  in: z.enum(['query', 'path', 'header', 'cookie']),
  required: z.boolean().optional(),
  schema: z.object({}).loose(),
})
const content = z.record(z.string(), z.object({ schema: z.object({}).loose().optional() }))
const response = z.object({ content: content.optional() })
const requestBody = z.object({ required: z.boolean().optional(), content })

export const operationShape = z.object({
  operationId: z.string(),
  parameters: z.array(z.union([reference, parameter])).optional(),
  requestBody: z.union([reference, requestBody]).optional(),
  responses: z.record(z.string(), z.union([reference, response])),
})

const documentShape = z.object({
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
  components: z.object({
    parameters: z.record(z.string(), parameter),
    requestBodies: z.record(z.string(), requestBody).default({}),
    responses: z.record(z.string(), response),
    schemas: z.record(z.string(), z.unknown()),
  }),
})

export type Parameter = z.infer<typeof parameter>
export type RequestBody = z.infer<typeof requestBody>
export type Response = z.infer<typeof response>
export type ContractDocument = z.infer<typeof documentShape>

/** The contract file: the package does not export it, so it is found beside the package's entry point. */
const contractFile = (): URL =>
  // `require.resolve` rather than `import.meta.resolve`: Vitest's module runner does not implement the latter.
  new URL('../openapi.yaml', pathToFileURL(createRequire(import.meta.url).resolve('@draftroom/contract')))

export function readContractDocument(): ContractDocument {
  return documentShape.parse(parse(readFileSync(contractFile(), 'utf8')))
}

export function isReference(candidate: object): candidate is Reference {
  return reference.safeParse(candidate).success
}
