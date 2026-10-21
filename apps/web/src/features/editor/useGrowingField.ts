import { useLayoutEffect, useRef } from 'react'

/**
 * The reference of a text area that holds `value` and is as tall as what is in it, so that a text that does not fit in a line
 * takes more lines and nothing is cut or scrolled. It measures again when the width changes (the margin of the comments comes
 * and goes, and the window is another one): the same words take another number of lines.
 *
 * The field is not controlled, and has no `value` or `defaultValue` from React: this puts `value` in it when it is not what is
 * there, which includes the first time. React sets the default value of a text area that has one at every render, and the
 * browser then undoes one letter at a time instead of what was typed.
 */
export function useGrowingField(value: string) {
  const field = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const element = field.current
    if (element === null) return
    if (element.value !== value) element.value = value
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
