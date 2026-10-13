import type { Editor } from '@tiptap/core'
import { configure, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from '../../../app/AppProviders.tsx'
import { routes } from '../../../app/routes.tsx'
import type { DataSource } from '../../../data/DataSource.ts'
import { DataSourceContext } from '../../../data/DataSourceContext.ts'
import { createMockServer } from '../../../data/mock/createMockDataSource.ts'
import { budget, launchPlan } from '../../../data/mock/fixtures/documents.ts'
import { daniel, marta, sofia } from '../../../data/mock/fixtures/index.ts'
import './jsdomShims.ts'

// The screen is a lazy route: the first test of a file waits for Vitest to load and transform Tiptap, which takes longer than
// the default second, and the retry of a request that never arrived waits one second by itself.
configure({ asyncUtilTimeout: 5000 })

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
}: RenderEditorOptions = {}) {
  const server = createMockServer()
  const base = server.connect({ signedInAs })
  const dataSource = wrap?.(base) ?? base
  const router = createMemoryRouter(routes, { initialEntries: [`/documents/${documentId}`] })
  const view = render(
    <StrictMode>
      <DataSourceContext value={dataSource}>
        <AppProviders>
          <RouterProvider router={router} />
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
