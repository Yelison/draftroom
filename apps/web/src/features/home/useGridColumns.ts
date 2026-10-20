import { useLayoutEffect, useState } from 'react'

/** What a window that cannot measure (a test without layout) assumes: the columns of the widest the grid gets. */
const assumedColumns = 4

/**
 * How many columns the grid has right now. The stylesheet decides it, by the width of the page, so the count is read
 * from the tracks the browser laid out and not worked out again here. It is read before the browser paints, and again
 * whenever the grid changes size. The grid is the element that `ref` is given to, which can come after the component
 * (a list that is drawn once its data is), so it is state and not a ref object: its arrival is what starts the reading.
 */
export function useGridColumns() {
  const [grid, ref] = useState<HTMLElement | null>(null)
  const [columns, setColumns] = useState(assumedColumns)

  useLayoutEffect(() => {
    if (grid === null) return
    const read = () => {
      const tracks = getComputedStyle(grid)
        .gridTemplateColumns.split(' ')
        .filter((track) => track.endsWith('px'))
      if (tracks.length > 0) setColumns(tracks.length)
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [grid])

  return { grid, ref, columns }
}
