import type { DocumentRole } from '@draftroom/contract'
import { describe, expect, it } from 'vitest'
import { connectionModeFor, type ConnectionMode } from './connectionMode.ts'

const readWrite: ConnectionMode = { access: 'granted', scope: 'read-write' }
const readOnly: ConnectionMode = { access: 'granted', scope: 'readonly' }
const refused: ConnectionMode = { access: 'refused' }

describe('the mode of a connection', () => {
  // Rows: the effective role. Columns: whether the document is live or archived (protocol §4).
  const rows: readonly (readonly [DocumentRole | null, ConnectionMode, ConnectionMode])[] = [
    ['owner', readWrite, readOnly],
    ['editor', readWrite, refused],
    ['commenter', readOnly, refused],
    ['viewer', readOnly, refused],
    [null, refused, refused],
  ]

  it.each(rows)('for the role %j is %j on a live document', (role, live) => {
    expect(connectionModeFor({ role, archived: false })).toEqual(live)
  })

  it.each(rows)('for the role %j is %j on an archived one', (role, _live, archived) => {
    expect(connectionModeFor({ role, archived: true })).toEqual(archived)
  })
})
