import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { DocumentRow, type DocumentRowVariant } from './DocumentRow.tsx'
import { DocumentRowLink } from './DocumentRowLink.tsx'

const variants: readonly DocumentRowVariant[] = ['default', 'selected', 'archived', 'folder']

describe('a document row', () => {
  it.each(variants)('draws the %s variant with its name', (variant) => {
    render(<DocumentRow variant={variant} title="Autumn launch plan" />)

    expect(screen.getByText('Autumn launch plan').closest('[data-variant]')).toHaveAttribute('data-variant', variant)
  })

  it('is a default row unless it says otherwise', () => {
    render(<DocumentRow title="Autumn launch plan" />)

    expect(screen.getByText('Autumn launch plan').closest('[data-variant]')).toHaveAttribute('data-variant', 'default')
  })

  it('shows a second line and what acts on the row', () => {
    render(<DocumentRow title="Autumn launch plan" meta="Updated Oct 13, 2026" trailing={<button>Actions</button>} />)

    expect(screen.getByText('Updated Oct 13, 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument()
  })

  it('leaves to the place it is used the role and the keyboard it needs', () => {
    render(<DocumentRow role="treeitem" aria-selected tabIndex={0} title="Autumn launch plan" />)

    expect(screen.getByRole('treeitem', { name: 'Autumn launch plan' })).toHaveAttribute('aria-selected', 'true')
  })

  it('does not take the focus away from the row: the selected one is not the focused one', () => {
    render(
      <>
        <DocumentRow variant="selected" aria-selected role="treeitem" tabIndex={-1} title="Open document" />
        <DocumentRow role="treeitem" tabIndex={0} title="Other document" />
      </>,
    )

    screen.getByRole('treeitem', { name: 'Other document' }).focus()

    expect(screen.getByRole('treeitem', { name: 'Other document' })).toHaveFocus()
    expect(screen.getByRole('treeitem', { name: 'Open document' })).toHaveAttribute('aria-selected', 'true')
  })

  it('has the link that opens it as its title', () => {
    render(
      <MemoryRouter>
        <DocumentRow card title={<DocumentRowLink to="/documents/1">Autumn launch plan</DocumentRowLink>} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Autumn launch plan' })).toHaveAttribute('href', '/documents/1')
  })
})
