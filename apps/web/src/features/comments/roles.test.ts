import type { DocumentRole, Schema } from '@draftroom/contract'
import { describe, expect, it } from 'vitest'
import { canComment, canDeleteComment, canEditComment } from './roles.ts'

const comment = (authorId: string): Schema<'Comment'> => ({
  id: 'c1',
  threadId: 't1',
  author: { id: authorId, name: 'Someone' },
  body: 'Text',
  createdAt: '2026-11-03T12:00:00.000Z',
  updatedAt: '2026-11-03T12:00:00.000Z',
})

const mine = comment('me')
const theirs = comment('them')

describe('what each role may do with comments (the table of docs/api/README.md)', () => {
  const matrix: {
    role: DocumentRole
    comment: boolean
    editOwn: boolean
    editOther: boolean
    deleteOwn: boolean
    deleteOther: boolean
  }[] = [
    { role: 'viewer', comment: false, editOwn: false, editOther: false, deleteOwn: false, deleteOther: false },
    { role: 'commenter', comment: true, editOwn: true, editOther: false, deleteOwn: true, deleteOther: false },
    { role: 'editor', comment: true, editOwn: true, editOther: false, deleteOwn: true, deleteOther: false },
    { role: 'owner', comment: true, editOwn: true, editOther: false, deleteOwn: true, deleteOther: true },
  ]

  it.each(matrix)('$role', ({ role, comment: mayComment, editOwn, editOther, deleteOwn, deleteOther }) => {
    expect({
      comment: canComment(role),
      editOwn: canEditComment(role, mine, 'me'),
      editOther: canEditComment(role, theirs, 'me'),
      deleteOwn: canDeleteComment(role, mine, 'me'),
      deleteOther: canDeleteComment(role, theirs, 'me'),
    }).toEqual({ comment: mayComment, editOwn, editOther, deleteOwn, deleteOther })
  })
})
