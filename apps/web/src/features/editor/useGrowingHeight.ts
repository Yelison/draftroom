import { useLayoutEffect, useRef } from 'react'

/**
 * Makes a text area as tall as what is in it, so that a text that does not fit in a line takes more lines and nothing is cut or
 * scrolled. It measures again when the width changes (the margin of the comments comes and goes, and the window is another
 * one): the same words take another number of lines. It gives the reference of the field.
 */
export function useGrowingHeight(value: string) {
  const field = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const element = field.current
    if (element === null) return
    const fit = () => {
      element.style.height = 'auto'
      // The border is not in `scrollHeight`, and the box is measured with it.
      element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    let width = element.offsetWidth
    const observer = new ResizeObserver(() => {
      if (element.offsetWidth === width) return
      width = element.offsetWidth
      fit()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [value])

  return field
}
