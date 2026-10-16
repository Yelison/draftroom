import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { AppProviders } from '../../../app/AppProviders.tsx'
import type { DataSource } from '../../../data/DataSource.ts'
import { DataSourceContext } from '../../../data/DataSourceContext.ts'
import { createMockServer } from '../../../data/mock/createMockDataSource.ts'
import { marta } from '../../../data/mock/fixtures/index.ts'
import { DocumentActivity } from '../DocumentActivity.tsx'

export interface RenderDocumentActivityOptions {
  /** Who is signed in; Marta, who owns every document, unless said. */
  signedInAs?: string
  /** Replaces the data source, to make a call fail, slow or small. It starts from the mock. */
  wrap?: (dataSource: DataSource) => DataSource
}

/** The activity of one document on its own, as the place that holds it would mount it: the providers, StrictMode and the mock. */
export function renderDocumentActivity(
  documentId: string,
  { signedInAs = marta.email, wrap }: RenderDocumentActivityOptions = {},
) {
  const base = createMockServer().connect({ signedInAs })
  const view = render(
    <StrictMode>
      <DataSourceContext value={wrap?.(base) ?? base}>
        <AppProviders>
          <QueryClientProvider client={new QueryClient()}>
            <section aria-label="Activity">
              <DocumentActivity documentId={documentId} />
            </section>
          </QueryClientProvider>
        </AppProviders>
      </DataSourceContext>
    </StrictMode>,
  )
  return { ...view, user: userEvent.setup() }
}
