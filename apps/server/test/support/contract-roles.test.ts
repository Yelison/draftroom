import { describe, expect, it } from 'vitest'
import { contractAllows } from './contract-roles.ts'

// The access matrix takes what each role may do from here, so a helper that let too much through would make its tests
// agree with a server that does the same. These are the rows of the contract for comments, written out.

describe('what the contract lets a role do to a comment', () => {
  it.each([
    ['updateComment', 'owner', true, true],
    ['updateComment', 'owner', false, false],
    ['updateComment', 'commenter', true, true],
    ['updateComment', 'viewer', true, false],
    ['deleteComment', 'owner', false, true],
    ['deleteComment', 'editor', false, false],
    ['deleteComment', 'editor', true, true],
    ['deleteComment', 'viewer', true, false],
  ])('%s by a %s who wrote it (%s): %s', (operationId, role, isAuthor, expected) => {
    expect(contractAllows(operationId, role, { isAuthor })).toBe(expected)
  })
})
