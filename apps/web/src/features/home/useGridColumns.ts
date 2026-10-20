import { useLayoutEffect, useRef, useState } from 'react'

/** What a window that cannot measure (a test without layout) assumes: the columns of the widest the grid gets. */
const assumedColumns = 4

/**
 * How many columns the grid of the element has right now. The stylesheet decides it, by the width of the page, so the
 * count is read from the tracks the browser laid out and not worked out again here. It is read before the browser paints,
 * and again whenever the grid changes size.
 */
export function useGridColumns<Element extends HTMLElement>() {
  const grid = useRef<Element>(null)
  const [columns, setColumns] = useState(assumedColumns)

  useLayoutEffect(() => {
    const element = grid.current
    if (element === null) return
    const read = () => {
      const tracks = getComputedStyle(element)
        .gridTemplateColumns.split(' ')
        .filter((track) => track.endsWith('px'))
      if (tracks.length > 0) setColumns(tracks.length)
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { grid, columns }
}
