// Generates src/schema.ts from openapi.yaml. The output is committed and CI regenerates it to catch drift.
import { writeFile } from 'node:fs/promises'
import openapiTS, { astToString } from 'openapi-typescript'

const source = new URL('../openapi.yaml', import.meta.url)
const target = new URL('../src/schema.ts', import.meta.url)

const ast = await openapiTS(source)
await writeFile(target, astToString(ast))
