import type { DocumentRole } from '@draftroom/contract'
import { describe, expect, it } from 'vitest'
import { commentVerdict, threadActivity, threadSurvives, type CommentAction } from './comments.ts'

// Who may change a comment is the matrix of plan §4.3 plus one fact the role cannot say: who wrote it. The rows are the
// contract's: "edit or delete own comment" (commenter, editor, owner, and the author) and "delete another person's
// comment" (owner).

const roles: readonly DocumentRole[] = ['viewer', 'commenter', 'editor', 'owner']

describe.each<[CommentAction, ReadonlyArray<readonly [DocumentRole, boolean, 'allowed' | 'forbidden']>]>([
  [
    'edit',
    [
      ['viewer', true, 'forbidden'],
      ['commenter', true, 'allowed'],
      ['editor', true, 'allowed'],
      ['owner', true, 'allowed'],
      // Only the author edits: a document owner changes nothing that somebody else said.
      ['viewer', false, 'forbidden'],
      ['commenter', false, 'forbidden'],
      ['editor', false, 'forbidden'],
      ['owner', false, 'forbidden'],
    ],
  ],
  [
    'delete',
    [
      // A person who was demoted to viewer wrote a comment when they could, but may not touch it now.
      ['viewer', true, 'forbidden'],
      ['commenter', true, 'allowed'],
      ['editor', true, 'allowed'],
      ['owner', true, 'allowed'],
      ['viewer', false, 'forbidden'],
      ['commenter', false, 'forbidden'],
      ['editor', false, 'forbidden'],
      ['owner', false, 'allowed'],
    ],
  ],
])('the verdict on a comment to %s', (action, cases) => {
  it.each(cases)('for a %s who is the author: %s', (role, isAuthor, expected) => {
    expect(commentVerdict(action, { role, isAuthor })).toBe(expected)
  })

  it('covers every role, written by the author and by someone else', () => {
    expect(cases.map(([role, isAuthor]) => `${role}/${isAuthor}`).sort()).toEqual(
      roles.flatMap((role) => [`${role}/true`, `${role}/false`]).sort(),
    )
  })
})

describe('a thread whose comment was deleted', () => {
  it.each([
    [2, true],
    [1, true],
    [0, false],
  ])('with %s comments left survives: %s', (remaining, survives) => {
    expect(threadSurvives(remaining)).toBe(survives)
  })
})

describe('the history of a thread', () => {
  it('has one kind of event for each thing a person does to it', () => {
    expect(threadActivity).toEqual({
      create: 'thread.created',
      reply: 'thread.replied',
      resolve: 'thread.resolved',
      reopen: 'thread.reopened',
    })
  })
})
