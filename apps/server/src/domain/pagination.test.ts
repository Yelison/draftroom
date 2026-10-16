import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './pagination.ts'

const position = { timestamp: '2026-10-13T15:30:00.000123Z', id: 'c4e6a8b0-2d3f-4b5a-9c7e-4a6c8e0b2d44' }
const filters = { workspaceId: '0b1f6d54-3c1a-4f55-9a43-6a7d2f5e8c01', query: null, folderId: null, archived: false }

describe('a cursor', () => {
  it('gives back the position it was made from, keeping the microseconds', () => {
    expect(decodeCursor(encodeCursor(position, filters), filters)).toEqual(position)
  })

  it('has the characters the contract allows for a cursor, and fits its length', () => {
    const cursor = encodeCursor(position, { ...filters, query: 'ü'.repeat(200) })

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(cursor.length).toBeLessThanOrEqual(512)
  })

  it('does not depend on the order the filters are listed in', () => {
    const reordered = { archived: false, folderId: null, query: null, workspaceId: filters.workspaceId }

    expect(decodeCursor(encodeCursor(position, filters), reordered)).toEqual(position)
  })

  it.each([
    ['another search', { ...filters, query: 'launch' }],
    ['another folder', { ...filters, folderId: 'a3d5c7e9-1b2f-4a6c-8d0e-3f5a7c9e1b33' }],
    ['the archive instead of the live documents', { ...filters, archived: true }],
    ['another workspace', { ...filters, workspaceId: 'a3d5c7e9-1b2f-4a6c-8d0e-3f5a7c9e1b33' }],
  ])('is refused when it is used for %s', (_name, other) => {
    expect(decodeCursor(encodeCursor(position, filters), other)).toBeNull()
  })

  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  const fingerprinted = JSON.parse(Buffer.from(encodeCursor(position, filters), 'base64url').toString('utf8')) as {
    f: string
  }

  it.each([
    ['text that is not base64 of JSON', 'not-a-cursor'],
    ['JSON that is not an object', encode(['2026-10-13T15:30:00.000123Z'])],
    ['an object without its fields', encode({ t: position.timestamp })],
    [
      'a timestamp with milliseconds only',
      encode({ t: '2026-10-13T15:30:00.123Z', i: position.id, f: fingerprinted.f }),
    ],
    ['a day that does not exist', encode({ t: '2026-02-30T15:30:00.000123Z', i: position.id, f: fingerprinted.f })],
    ['an id that is not a UUID', encode({ t: position.timestamp, i: 'c4e6a8b0', f: fingerprinted.f })],
  ])('is refused when it holds %s', (_name, token) => {
    expect(decodeCursor(token, filters)).toBeNull()
  })
})
