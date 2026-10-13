// Generates src/schema.ts from openapi.yaml. The output is committed and CI regenerates it to catch drift.
import { writeFile } from 'node:fs/promises'
import openapiTS, { astToString } from 'openapi-typescript'

const source = new URL('../openapi.yaml', import.meta.url)
const target = new URL('../src/schema.ts', import.meta.url)

const header = '// Generated from openapi.yaml by scripts/generate.mjs (`npm run api:types`). Do not edit by hand.\n\n'

const ast = await openapiTS(source)
await writeFile(target, header + astToString(ast))
