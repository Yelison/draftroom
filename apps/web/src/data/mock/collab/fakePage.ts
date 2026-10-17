import type { PageEnvironment } from './browserPage.ts'

/**
 * A page the test drives: it is shown or hidden when the test says, and no other tab is open. The person asked for less
 * motion, so that she takes her place in the tests of the controller and does not type.
 */
export function fakePage(overrides: Partial<PageEnvironment> = {}) {
  let hidden = false
  const listeners = new Set<() => void>()
  const page: PageEnvironment = {
    random: () => 0.5,
    reducedMotion: () => true,
    hidden: () => hidden,
    onVisibilityChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onPageHide: () => undefined,
    takeTurn: () => Promise.resolve(() => undefined),
    isReload: () => false,
    ...overrides,
  }
  return {
    page,
    show(isHidden: boolean) {
      hidden = isHidden
      listeners.forEach((listener) => listener())
    },
  }
}
