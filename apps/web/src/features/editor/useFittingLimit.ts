import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * How many of `max` avatars a zone has room for, whatever font the machine draws the count in: a zone that only fits by a few
 * pixels with one font does not with another, so the number cannot be decided from the width of the window. The avatars are
 * drawn as many as the zone allows, one fewer at a time, and the rest are counted by the count the list itself draws. It is done
 * before the browser paints, so nobody sees an avatar and then not.
 *
 * The zone is the element of `zone`, which has to take the room it is given (`flex: 1 1 0`, `min-width: 0`) and not the width of
 * its content, or its width would change with the number of avatars and this would never settle. It starts again from `max`
 * when its width, the number of people or the fonts change.
 */
export function useFittingLimit(max: number, people: number) {
  const zone = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [fonts, setFonts] = useState(0)
  const key = `${max}:${people}:${width}:${fonts}`
  const [fit, setFit] = useState({ key, limit: max })
  // Another width or another crowd is another question: adjusted while rendering, from what the last render answered.
  if (fit.key !== key) setFit({ key, limit: max })
  const limit = fit.key === key ? fit.limit : max

  useLayoutEffect(() => {
    const element = zone.current
    const list = element?.querySelector('ul')
    if (element === null || list === null || list === undefined || limit === 0) return
    const style = getComputedStyle(element)
    const room =
      element.clientWidth -
      (Number.parseFloat(style.paddingInlineStart) || 0) -
      (Number.parseFloat(style.paddingInlineEnd) || 0)
    if (list.offsetWidth > room) setFit({ key, limit: limit - 1 })
  }, [key, limit])

  useEffect(() => {
    const element = zone.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? 0)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // A font that arrives after the first paint draws the same words wider or narrower, and the zone is the same width.
  useEffect(() => {
    const loaded = () => setFonts((count) => count + 1)
    document.fonts?.addEventListener('loadingdone', loaded)
    return () => document.fonts?.removeEventListener('loadingdone', loaded)
  }, [])

  return { zone, limit }
}
