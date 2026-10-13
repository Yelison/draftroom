/**
 * The protocols a link may use: the ones a person can follow safely from a document. Everything else (`javascript:`,
 * `data:`, `file:`, `tel:`…) is refused, and so is a link with no protocol, such as `/page` or `//host`, which would
 * resolve against whatever origin shows the document.
 */
const allowedProtocols: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:'])

/**
 * Whether a link's address is one a document may hold. It asks the URL parser rather than a pattern, so it sees what a
 * browser would: the parser drops tabs, newlines and the spaces around the address, and reads the scheme without regard
 * to case, which is how `java\tscript:` and `JaVaScRiPt:` get past a naive check.
 */
export function isAllowedLinkHref(href: string | null | undefined): href is string {
  if (!href) return false
  try {
    return allowedProtocols.has(new URL(href).protocol)
  } catch {
    // Not an absolute URL: no protocol to trust.
    return false
  }
}
