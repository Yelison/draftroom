/** The id of the `<main>` of every layout: the target of the skip link and the fallback of the focus after navigating. */
export const mainContentId = 'main-content'

/**
 * Moves the focus to the heading of the page on screen, or to the work area when the heading cannot take it (a page
 * with none, or one that forgot `tabIndex={-1}`), so that after a change of page the focus is never left on a link
 * that is gone or on `body`. A screen reader reads the heading, which is what announces the new page.
 */
export function focusMainContent() {
  const main = document.getElementById(mainContentId)
  const heading = main?.querySelector('h1')
  heading?.focus()
  if (heading === null || heading === undefined || document.activeElement !== heading) main?.focus()
}
