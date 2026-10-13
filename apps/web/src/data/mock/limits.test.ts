import { describe, expect, it } from 'vitest'
import { loadContract } from '../testing/contract.ts'
import { textLimits } from './limits.ts'

const contract = loadContract()

// The limits live in the schemas of openapi.yaml and, for the ones a form needs, in `contractLimits`: the mock must
// not hold a second opinion about any of them.
describe('the text limits of the mock', () => {
  it.each([
    ['documentTitle', 'DocumentTitle'],
    ['commentBody', 'CommentBody'],
    ['quote', 'Quote'],
    ['folderName', 'FolderName'],
    ['workspaceName', 'WorkspaceName'],
    ['versionLabel', 'VersionLabel'],
    ['personName', 'PersonName'],
    ['email', 'Email'],
    ['password', 'Password'],
  ] as const)('match the %s schema', (limit, schemaName) => {
    const schema = contract.schema(schemaName)

    expect(textLimits[limit].max).toBe(schema.maxLength)
    expect(textLimits[limit].min).toBe(schema.minLength ?? 1)
  })
})
