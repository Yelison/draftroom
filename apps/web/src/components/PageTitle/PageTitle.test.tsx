import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '../../app/AppProviders.tsx'
import { PageTitle } from './PageTitle.tsx'

describe('PageTitle', () => {
  it('writes a message of the catalogue as the headline and the tab title', async () => {
    render(
      <AppProviders>
        <PageTitle titleId="screen.trash" />
      </AppProviders>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Trash' })).toHaveAttribute('tabindex', '-1')
    await waitFor(() => expect(document.title).toBe('Trash · Draftroom'))
  })

  it('writes a title the screen formatted as it is', async () => {
    render(
      <AppProviders>
        <PageTitle title="Results for “launch”" />
      </AppProviders>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Results for “launch”' })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Results for “launch” · Draftroom'))
  })
})
