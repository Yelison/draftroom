import { editorExtensions } from '@draftroom/editor-schema'
import { fragmentName } from '@draftroom/editor-schema'
import { Editor } from '@tiptap/core'
import { Collaboration } from '@tiptap/extension-collaboration'
import { absolutePositionToRelativePosition, ySyncPluginKey } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { expect, vi } from 'vitest'
import { presenceLookOf } from '../../../collab/presenceColor.ts'
import { createCollabSession } from '../../../collab/session.ts'
import type { MockServer } from '../../../data/mock/createMockDataSource.ts'

/**
 * Someone else in the document, made of the same parts as the person at the screen: a session on the same collaboration
 * server and a headless editor bound to it. What they type and where their caret is reaches the screen the way it reaches
 * it from another browser.
 */
export async function joinAsPeer({
  server,
  documentId,
  person,
  serverName = person.name,
}: {
  server: MockServer
  documentId: string
  /** Who they say they are: what their client writes in its awareness. */
  person: { id: string; name: string }
  /** What the server knows them as, which is what the others are shown. */
  serverName?: string
}) {
  const session = createCollabSession({
    documentId,
    url: 'ws://simulated.invalid',
    webSocket: server.collaboration.socketFor({ userId: person.id, displayName: serverName }),
  })
  const { ydoc, provider } = session.getSnapshot()
  // Without the caret extension: its plugin publishes the caret only while its view has focus, and a headless editor has
  // none, so it would take the caret back as fast as `placeCaret` puts it. The person is published by hand.
  const editor = new Editor({
    extensions: [...editorExtensions(), Collaboration.configure({ document: ydoc, field: fragmentName })],
  })
  provider.setAwarenessField('user', { ...person, color: presenceLookOf(person.id).color })
  await vi.waitFor(() => expect(session.getSnapshot().state).toMatch(/synced|synchronising/))
  return {
    session,
    editor,
    /**
     * Puts their caret at a position of the text, written into the awareness the way the cursor plugin of a browser with
     * focus would write it.
     */
    placeCaret(position: number) {
      const binding = ySyncPluginKey.getState(editor.state)?.binding
      if (binding === undefined || binding === null)
        throw new Error('The editor of the peer is not bound to the document')
      const relative = absolutePositionToRelativePosition(position, ydoc.getXmlFragment('default'), binding.mapping)
      const cursor = Y.relativePositionToJSON(relative)
      provider.setAwarenessField('cursor', { anchor: cursor, head: cursor })
    },
    leave() {
      editor.destroy()
      session.destroy()
    },
  }
}
