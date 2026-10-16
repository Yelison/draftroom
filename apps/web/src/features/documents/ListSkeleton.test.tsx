import { render, screen } from '@testing-library/react'
import { IntlProvider } from 'react-intl'
import { describe, expect, it } from 'vitest'
import { messages } from '../../i18n/messages.ts'
import { DocumentsSkeleton, ListSkeleton, type ListSkeletonProps } from './ListSkeleton.tsx'

const inEnglish = (skeleton: React.ReactNode) =>
  render(
    <IntlProvider locale="en" messages={messages.en}>
      {skeleton}
    </IntlProvider>,
  )

const renderSkeleton = (props: Partial<ListSkeletonProps> = {}) =>
  inEnglish(<ListSkeleton rows={6} listClassName="column" label="documents.loading" {...props} />)

describe('the skeleton of a list', () => {
  it.each<{ rows: number }>([{ rows: 1 }, { rows: 4 }, { rows: 9 }])(
    'draws $rows rows when it is told so',
    ({ rows }) => {
      renderSkeleton({ rows })

      expect(screen.getAllByRole('listitem')).toHaveLength(rows)
    },
  )

  it('puts its rows in the list class of the screen that asked, so they lie where the real ones will', () => {
    renderSkeleton({ listClassName: 'trash-column' })

    expect(screen.getByRole('list')).toHaveClass('trash-column')
  })

  it('has no list class when the screen has none to give, and never the class of another screen', () => {
    renderSkeleton({ listClassName: undefined })

    expect(screen.getByRole('list')).not.toHaveAttribute('class')
  })

  it('says what is loading in the live region, in the words of the screen that asked', () => {
    renderSkeleton({ label: 'trash.loading' })

    expect(screen.getByRole('status')).toHaveTextContent('Loading the trash')
  })

  it('is busy as a whole, with the rows and what it says inside', () => {
    renderSkeleton()

    const busy = screen.getByRole('list').closest('[aria-busy="true"]')
    expect(busy).toContainElement(screen.getByRole('status'))
  })
})

describe('the skeleton of the documents', () => {
  it('draws six rows in the grid of the documents and says that they are loading', () => {
    inEnglish(<DocumentsSkeleton />)

    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByRole('list')).toHaveClass('grid')
    expect(screen.getByRole('status')).toHaveTextContent('Loading documents')
  })
})
