import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { IntlProvider } from 'react-intl'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../data/errors.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { messages } from '../../i18n/messages.ts'
import { SectionError } from './SectionError.tsx'

const unauthenticated = new ApiError({ type: 'about:blank', title: 'No session', status: 401, code: 'unauthenticated' })

async function renderError(sessionEnded: boolean) {
  const queryClient = new QueryClient()
  if (sessionEnded) {
    await queryClient
      .fetchQuery({ queryKey: queryKeys.me(), queryFn: () => Promise.reject(unauthenticated), retry: false })
      .catch(() => {})
  }
  render(
    <IntlProvider locale="en" messages={messages.en}>
      <QueryClientProvider client={queryClient}>
        <SectionError title="home.pinned.error" retrying={false} onRetry={() => {}} />
      </QueryClientProvider>
    </IntlProvider>,
  )
}

describe('the error of a section of Home', () => {
  it('says the section could not be read, with the way to try again', async () => {
    await renderError(false)

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load")
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('says nothing when the session is what has ended, because the person is about to be sent to sign in', async () => {
    await renderError(true)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
