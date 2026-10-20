/**
 * How many documents a folder shows before "Show more". Five keeps a workspace with several folders readable on one
 * screen, and most folders hold no more than that, so most sections never need the button.
 */
export const sectionPageSize = 5

/**
 * How many folders are open when the screen opens; the rest are folded and ask for nothing until the person opens them.
 * Every open section asks for its first page at once, and the page is shown when the last one is in: a browser keeps six
 * connections to a server, so six folders (with "Pinned" and "No folder", which are always open) are about two rounds of
 * waiting, where forty would be seven and as slow as the slowest of them.
 */
export const openFolderCount = 6
