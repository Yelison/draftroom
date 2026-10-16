import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { useFocusFirstArrival } from './useFocusFirstArrival.ts'

/** A list with a link and a button on each row, and the "Load more" that sits after it. */
function List({ rows, selector }: { rows: number; selector: string }) {
  const list = useRef<HTMLUListElement>(null)
  const loadingMore = useFocusFirstArrival(list, rows, selector)

  return (
    <>
      <ul ref={list}>
        {Array.from({ length: rows }, (_, row) => (
          <li key={row}>
            <a href={`#${row}`}>Open {row}</a>
            <button>Act on {row}</button>
          </li>
        ))}
      </ul>
      <button onClick={loadingMore}>Load more</button>
    </>
  )
}

const loadMore = async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Load more' }))
  return user
}

describe('the focus when a page of a list arrives', () => {
  it.each([
    { selector: 'a', arrives: 'link', name: 'Open 3' },
    { selector: 'button', arrives: 'button', name: 'Act on 3' },
  ] as const)(
    'goes to the $arrives of the first row that arrived, for the selector "$selector"',
    async ({ selector, arrives, name }) => {
      const { rerender } = render(<List rows={3} selector={selector} />)
      await loadMore()

      rerender(<List rows={5} selector={selector} />)

      expect(screen.getByRole(arrives, { name })).toHaveFocus()
    },
  )

  it('stays where it is until the page is in, even if a row leaves meanwhile', async () => {
    const { rerender } = render(<List rows={3} selector="a" />)
    await loadMore()

    rerender(<List rows={2} selector="a" />)
    expect(screen.getByRole('button', { name: 'Load more' })).toHaveFocus()

    rerender(<List rows={4} selector="a" />)
    expect(screen.getByRole('link', { name: 'Open 3' })).toHaveFocus()
  })

  it('moves once for each time a page was asked for', async () => {
    const { rerender } = render(<List rows={3} selector="a" />)
    await loadMore()
    rerender(<List rows={5} selector="a" />)
    screen.getByRole('button', { name: 'Load more' }).focus()

    // The page was already given its focus; rows that come on their own afterwards do not take it back.
    rerender(<List rows={7} selector="a" />)

    expect(screen.getByRole('button', { name: 'Load more' })).toHaveFocus()
  })

  it('does not take the focus from the person when rows arrive that nobody asked for', () => {
    const { rerender } = render(<List rows={3} selector="a" />)
    screen.getByRole('button', { name: 'Load more' }).focus()

    rerender(<List rows={5} selector="a" />)

    expect(screen.getByRole('button', { name: 'Load more' })).toHaveFocus()
  })
})
