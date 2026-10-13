import { describe, expect, it } from 'vitest'
import { loadContract } from './contract.ts'

const contract = loadContract()

const document = {
  id: '00000004-0000-4000-8000-000000000001',
  workspaceId: '00000002-0000-4000-8000-000000000001',
  folderId: null,
  title: 'Autumn launch plan',
  excerpt: null,
  revision: 1,
  role: 'owner',
  generalAccess: 'none',
  pinned: false,
  createdBy: { id: '00000001-0000-4000-8000-000000000001', name: 'Marta Ruiz' },
  createdAt: '2026-10-13T09:00:00.000Z',
  updatedAt: '2026-10-13T09:00:00.000Z',
  archivedAt: null,
}

const notFound = { type: '/problems/not-found', title: 'Not found.', status: 404, code: 'not-found' }

describe('the contract check', () => {
  it('reads every operation of openapi.yaml', () => {
    expect(contract.operations).toHaveLength(46)
  })

  it('accepts an answer that matches the schema of the operation', () => {
    expect(contract.check('getDocument', { status: 200, body: document })).toEqual([])
  })

  it('names the field of an answer that does not', () => {
    const { excerpt: _excerpt, ...withoutExcerpt } = document

    expect(contract.check('getDocument', { status: 200, body: withoutExcerpt })).toEqual([
      expect.stringContaining('must have required property'),
    ])
  })

  it('rejects a value outside an enum', () => {
    expect(contract.check('getDocument', { status: 200, body: { ...document, role: 'admin' } })).not.toEqual([])
  })

  it('rejects a field the schema does not allow', () => {
    expect(contract.check('getDocument', { status: 200, body: { ...document, secret: 1 } })).not.toEqual([])
  })

  it('checks a format, such as the shape of an id', () => {
    expect(contract.check('getDocument', { status: 200, body: { ...document, id: 'not-a-uuid' } })).not.toEqual([])
  })

  it('accepts a problem the operation declares', () => {
    expect(contract.check('getDocument', { status: 404, body: notFound })).toEqual([])
  })

  it('rejects a problem whose code is not one of the contract', () => {
    expect(contract.check('getDocument', { status: 404, body: { ...notFound, code: 'gone' } })).not.toEqual([])
  })

  it('rejects a status the operation does not declare', () => {
    expect(contract.check('getMe', { status: 413, body: { ...notFound, status: 413, code: 'too-large' } })).toEqual([
      'getMe does not declare a 413 response',
    ])
  })

  it('takes the default response only for an unexpected failure', () => {
    const unexpected = { type: '/problems/internal-error', title: 'Failure.', status: 500, code: 'internal-error' }

    expect(contract.check('getMe', { status: 500, body: unexpected })).toEqual([])
    expect(contract.check('getMe', { status: 418, body: unexpected })).not.toEqual([])
  })

  it('expects no body where the operation declares none', () => {
    expect(contract.check('pinDocument', { status: 204, body: undefined })).toEqual([])
    expect(contract.check('pinDocument', { status: 204, body: {} })).not.toEqual([])
  })

  it('compiles the schema of every declared response', () => {
    for (const operation of contract.operations) {
      for (const status of operation.statuses.filter((declared) => declared !== 'default')) {
        expect(() => contract.check(operation.id, { status: Number(status), body: undefined })).not.toThrow()
      }
    }
  })

  it('finds the one success status of every operation', () => {
    expect(contract.successStatus('createDocument')).toBe(201)
    expect(contract.successStatus('removeMember')).toBe(204)
    for (const operation of contract.operations) expect(() => contract.successStatus(operation.id)).not.toThrow()
  })
})
