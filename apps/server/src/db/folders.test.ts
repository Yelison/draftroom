import { describe, expect, it } from 'vitest'
import { isForeignKeyViolation } from './folders.ts'

describe('reading a foreign key violation', () => {
  const refusal = (constraint: string) => Object.assign(new Error('refused'), { code: '23503', constraint })

  it('recognises one, whichever constraint refused', () => {
    expect(isForeignKeyViolation(refusal('documents_folder_fkey'))).toBe(true)
  })

  it('recognises the one it is asked about, and not another', () => {
    expect(isForeignKeyViolation(refusal('documents_folder_fkey'), 'documents_folder_fkey')).toBe(true)
    expect(isForeignKeyViolation(refusal('document_access_member_fkey'), 'documents_folder_fkey')).toBe(false)
  })

  it.each([
    [
      'another code of PostgreSQL',
      Object.assign(new Error('unique'), { code: '23505', constraint: 'documents_folder_fkey' }),
    ],
    ['an error with no code', new Error('refused')],
    ['something that is not an object', 'refused'],
    ['nothing', undefined],
  ])('does not take %s for one', (_name, error) => {
    expect(isForeignKeyViolation(error, 'documents_folder_fkey')).toBe(false)
  })
})
