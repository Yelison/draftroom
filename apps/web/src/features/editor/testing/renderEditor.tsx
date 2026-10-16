import type { Editor } from '@tiptap/core'
import type * as Y from 'yjs'
import { configure, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, type ReactNode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from '../../../app/AppProviders.tsx'
import { routes } from '../../../app/routes.tsx'
import type { DataSource } from '../../../data/DataSource.ts'
import { withFreshIndexedDb } from '../../../collab/testing/fakeIndexedDb.ts'
import { DataSourceContext } from '../../../data/DataSourceContext.ts'
import { createMockServer, type MockServer } from '../../../data/mock/createMockDataSource.ts'
import { documentName } from '@draftroom/contract/collab'
import { budget, launchPlan } from '../../../data/mock/fixtures/documents.ts'
import { daniel, marta, sofia } from '../../../data/mock/fixtures/index.ts'
import { vi } from 'vitest'
import './jsdomShims.ts'

// The screen is a lazy route and the editor mounts Tiptap in StrictMode: the first test of a file waits for Vitest to load
// and transform it, and the retry of a request that never arrived waits one second by itself. On a runner that is busy
// the five seconds a wait has by default ran out (5.16 s in CI, in the test of the skeleton) though nothing was wrong, so
// every wait of these tests has half of the twenty seconds a test has: one that never arrives still fails.
configure({ asyncUtilTimeout: 10_000 })
// The browser keeps a copy of every document that is opened: each test starts on one that has kept nothing.
withFreshIndexedDb()
// A test that waits for the lazy screen and then for the editor can take longer than Vitest's default five seconds on a
// machine that is busy with something else.
vi.setConfig({ testTimeout: 20_000 })

/**
 * The people of the mock and what each is on the documents of the fixtures, which the tests of the roles read: Marta owns
 * the workspace, so every document; Daniel edits the launch plan and can only read the 2027 budget; Sofía comments on the
 * launch plan.
 */
export const people = { marta: marta.email, daniel: daniel.email, sofia: sofia.email } as const

export { budget, launchPlan }

export interface RenderEditorOptions {
  /** The document to open; the launch plan unless said. */
  documentId?: string
  /** Who is signed in; Marta unless said. */
  signedInAs?: string
  /** Replaces the data source, to make a call fail or to watch it. It starts from the mock the person would have had. */
  wrap?: (dataSource: DataSource) => DataSource
  /** Rendered beside the router, inside the providers: a way for a test to reach the language or the theme. */
  extra?: ReactNode
  /** Puts content in the document on the collaboration server before it is opened, as if someone had written it. */
  content?: (shared: Y.Doc) => void
  /** Called with the mock server before anything is opened, to make it hold or refuse what a test needs it to. */
  before?: (server: MockServer) => void
}

/**
 * The editor as the app mounts it: the real route table, with its layout and its lazy screen, the real providers and
 * StrictMode, on a data source that is the mock with one person signed in. It returns the mock server too, so a test can
 * have a second person change the same data.
 */
export function renderEditor({
  documentId = launchPlan.id,
  signedInAs = people.marta,
  wrap,
  extra,
  content,
  before,
}: RenderEditorOptions = {}) {
  const server = createMockServer()
  before?.(server)
  content?.(server.collaboration.document(documentName(documentId)))
  const base = server.connect({ signedInAs })
  const dataSource = wrap?.(base) ?? base
  const router = createMemoryRouter(routes, { initialEntries: [`/documents/${documentId}`] })
  const view = render(
    <StrictMode>
      <DataSourceContext value={dataSource}>
        <AppProviders>
          <RouterProvider router={router} />
          {extra}
        </AppProviders>
      </DataSourceContext>
    </StrictMode>,
  )
  return { ...view, router, server }
}

/**
 * Opens a document and waits for its text area. It returns the Tiptap editor behind it, which Tiptap hangs on the element
 * it draws: the tests put text in with it, because typing into a `contenteditable` is something only a browser does like
 * a browser, and the end-to-end suite does that part.
 */
export async function openEditor(options?: RenderEditorOptions) {
  const view = renderEditor(options)
  const user = userEvent.setup()
  const text = await screen.findByRole('textbox', { name: /Document content|Contenido del documento/ })
  const { editor } = text as HTMLElement & { editor: Editor }
  return { ...view, user, text, editor }
}

/** The Yjs document an editor was given: the Collaboration extension keeps it in its options. */
export function ydocOf(editor: Editor): Y.Doc {
  const collaboration = editor.extensionManager.extensions.find((extension) => extension.name === 'collaboration')
  return collaboration?.options.document as Y.Doc
}
