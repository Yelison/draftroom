/**
 * The levels of heading a document has. The document's title is the page's level 1 and lives outside the Yjs document,
 * so the content starts at 2. Adding a level is a change to the schema: it goes through the owner of this package.
 */
export const headingLevels = [2, 3] as const
