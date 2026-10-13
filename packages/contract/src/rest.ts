import type { components, operations, paths } from './schema.ts'

export type { components, operations, paths }

type Schemas = components['schemas']

/** A schema of the contract by name: `Schema<'Document'>`. */
export type Schema<Name extends keyof Schemas> = Schemas[Name]

export type WorkspaceRole = Schema<'WorkspaceRole'>
export type DocumentRole = Schema<'DocumentRole'>
export type GeneralAccess = Schema<'GeneralAccess'>
export type ErrorCode = Schema<'ErrorCode'>
export type FieldErrorCode = Schema<'FieldErrorCode'>
export type Problem = Schema<'Problem'>

/**
 * The limits of plan §4.1 as values, for inputs and validators. The generated types cannot carry them; a contract test
 * pins every figure here to its schema in `openapi.yaml`.
 *
 * Lengths count Unicode code points, as JSON Schema does: count with `[...value].length`, not `value.length` and not the
 * HTML `maxlength` attribute, which both count UTF-16 units and would cut an emoji-heavy title short.
 */
export const contractLimits = {
  documentTitle: { min: 1, max: 200 },
  commentBody: { min: 1, max: 5000 },
  quote: { min: 1, max: 500 },
  folderName: { min: 1, max: 80 },
  workspaceName: { min: 1, max: 80 },
  versionLabel: { min: 1, max: 100 },
  page: { defaultSize: 25, maxSize: 100 },
} as const
