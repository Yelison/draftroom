import { render, screen } from '@testing-library/react'
import { IntlProvider } from 'react-intl'
import { describe, expect, it } from 'vitest'
import { messages } from '../../i18n/messages.ts'
import { TrashSkeleton } from './TrashSkeleton.tsx'

describe('the skeleton of the trash', () => {
  it('draws four rows in the list of the trash and a panel beside it, and says that it is loading', () => {
    const { container } = render(
      <IntlProvider locale="en" messages={messages.en}>
        <TrashSkeleton />
      </IntlProvider>,
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByRole('list')).toHaveClass('list')
    expect(container.querySelector('.panel')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading the trash')
  })
})
