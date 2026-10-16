import { documentName } from '@draftroom/contract/collab'
import { Connection, Document, Hocuspocus } from '@hocuspocus/server'
import { describe, expect, it, vi } from 'vitest'
import { broadcastToDocument } from './broadcastToDocument.ts'
import type { ConnectionContext } from './context.ts'

// What the server tells every connection of a document that is open (protocol §9), and what it does for one that is not.

const documentId = '00000000-0000-4000-8000-000000000001'
const event = { type: 'comments-changed', threadId: '00000000-0000-4000-8000-000000000002' } as const
const context: ConnectionContext = {
  userId: 'u',
  workspaceId: 'w',
  role: 'editor',
  displayName: 'Eli',
  sessionId: null,
}

/** A connection with nowhere to send: it records what it was sent. */
function connectionTo(document: Document, readOnly: boolean) {
  const socket = { send: vi.fn(), close: vi.fn(), readyState: 1 }
  const connection = new Connection(socket, new Request('http://localhost'), document, 'socket', context, readOnly)
  return { connection, socket }
}

function openDocument() {
  const instance = new Hocuspocus()
  const document = new Document(documentName(documentId))
  instance.documents.set(document.name, document)
  return { instance, document }
}

describe('broadcasting to a document', () => {
  it('reaches every connection of an open document, the ones that can only read included', () => {
    const { instance, document } = openDocument()
    const writer = connectionTo(document, false)
    const reader = connectionTo(document, true)

    broadcastToDocument(instance, documentId, event)

    expect([writer.socket.send.mock.calls.length, reader.socket.send.mock.calls.length]).toEqual([1, 1])
  })

  it('does not reach the connections of another document', () => {
    const { instance, document } = openDocument()
    const other = new Document(documentName('00000000-0000-4000-8000-000000000003'))
    instance.documents.set(other.name, other)
    const here = connectionTo(document, false)
    const there = connectionTo(other, false)

    broadcastToDocument(instance, documentId, event)

    expect([here.socket.send.mock.calls.length, there.socket.send.mock.calls.length]).toEqual([1, 0])
  })

  it('does nothing for a document nobody has open, and does not load it', () => {
    const instance = new Hocuspocus()

    expect(() => broadcastToDocument(instance, documentId, event)).not.toThrow()
    expect(instance.documents.size).toBe(0)
  })
})
