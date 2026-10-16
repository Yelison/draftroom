import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { useFocusFirstArrival } from './useFocusFirstArrival.ts'

/** A list with a link and a button on each row, and the "Load more" that sits after it. */
function List({ ids, selector }: { ids: readonly string[]; selector: string }) {
  const list = useRef<HTMLUListElement>(null)
  const loadingMore = useFocusFirstArrival(list, ids, selector)

  return (
    <>
      <ul ref={list}>
        {ids.map((id) => (
          <li key={id}>
            <a href={`#${id}`}>Open {id}</a>
            <button>Act on {id}</button>
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

const loadMoreButton = () => screen.getByRole('button', { name: 'Load more' })

describe('the focus when a page of a list arrives', () => {
  it.each([
    { selector: 'a', arrives: 'link', name: 'Open d' },
    { selector: 'button', arrives: 'button', name: 'Act on d' },
  ] as const)(
    'goes to the $arrives of the first row that arrived, for the selector "$selector"',
    async ({ selector, arrives, name }) => {
      const { rerender } = render(<List ids={['a', 'b', 'c']} selector={selector} />)
      await loadMore()

      rerender(<List ids={['a', 'b', 'c', 'd', 'e']} selector={selector} />)

      expect(screen.getByRole(arrives, { name })).toHaveFocus()
    },
  )

  it('goes to the first row that arrived when a row left meanwhile and several came', async () => {
    const { rerender } = render(<List ids={['a', 'b', 'c']} selector="a" />)
    await loadMore()

    rerender(<List ids={['a', 'c']} selector="a" />)
    expect(loadMoreButton()).toHaveFocus()

    rerender(<List ids={['a', 'c', 'd', 'e']} selector="a" />)
    expect(screen.getByRole('link', { name: 'Open d' })).toHaveFocus()
  })

  it('goes to the row that arrived when a row left meanwhile and only one came', async () => {
    const { rerender } = render(<List ids={['a', 'b', 'c']} selector="a" />)
    await loadMore()

    rerender(<List ids={['a', 'c']} selector="a" />)
    rerender(<List ids={['a', 'c', 'd']} selector="a" />)

    expect(screen.getByRole('link', { name: 'Open d' })).toHaveFocus()
  })

  it('gives up when the page comes in empty, and rows that come later on their own do not take the focus', async () => {
    const { rerender } = render(<List ids={['a', 'b', 'c']} selector="a" />)
    await loadMore()

    rerender(<List ids={['a', 'b', 'c']} selector="a" />)
    rerender(<List ids={['a', 'b', 'c', 'd']} selector="a" />)

    expect(loadMoreButton()).toHaveFocus()
  })

  it('moves once for each time a page was asked for', async () => {
    const { rerender } = render(<List ids={['a', 'b', 'c']} selector="a" />)
    await loadMore()
    rerender(<List ids={['a', 'b', 'c', 'd', 'e']} selector="a" />)
    loadMoreButton().focus()

    // The page was already given its focus; rows that come on their own afterwards do not take it back.
    rerender(<List ids={['a', 'b', 'c', 'd', 'e', 'f', 'g']} selector="a" />)

    expect(loadMoreButton()).toHaveFocus()
  })

  it('does not take the focus from the person when rows arrive that nobody asked for', () => {
    const { rerender } = render(<List ids={['a', 'b', 'c']} selector="a" />)
    loadMoreButton().focus()

    rerender(<List ids={['a', 'b', 'c', 'd', 'e']} selector="a" />)

    expect(loadMoreButton()).toHaveFocus()
  })
})
