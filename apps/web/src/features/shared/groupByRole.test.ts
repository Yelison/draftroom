import type { Schema } from '@draftroom/contract'
import { describe, expect, it } from 'vitest'
import { groupByRole } from './groupByRole.ts'

const document = (id: string, role: Schema<'DocumentRole'>) => ({ id, role }) as Schema<'Document'>

const summary = (documents: Schema<'Document'>[]) =>
  groupByRole(documents).map(({ role, documents }) => [role, documents.map(({ id }) => id)])

describe('groupByRole', () => {
  it.each([
    ['no documents has no group', [], []],
    ['one role has one group', [document('a', 'viewer'), document('b', 'viewer')], [['viewer', ['a', 'b']]]],
    [
      'the three roles come as editor, commenter and viewer whatever the order they arrive in',
      [document('v', 'viewer'), document('c', 'commenter'), document('e', 'editor')],
      [
        ['editor', ['e']],
        ['commenter', ['c']],
        ['viewer', ['v']],
      ],
    ],
    [
      'a role that is missing leaves no empty group between the others',
      [document('v', 'viewer'), document('e', 'editor')],
      [
        ['editor', ['e']],
        ['viewer', ['v']],
      ],
    ],
    [
      'the documents of a group keep the order of the list',
      [document('1', 'editor'), document('2', 'commenter'), document('3', 'editor'), document('4', 'editor')],
      [
        ['editor', ['1', '3', '4']],
        ['commenter', ['2']],
      ],
    ],
    [
      'a document the person owns is not shared with them',
      [document('mine', 'owner'), document('v', 'viewer')],
      [['viewer', ['v']]],
    ],
  ])('%s', (_name, documents, expected) => {
    expect(summary(documents)).toEqual(expected)
  })
})
