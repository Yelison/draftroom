/**
 * The protocols a link may use: the ones a person can follow safely from a document. Everything else (`javascript:`,
 * `data:`, `file:`, `tel:`…) is refused, and so is a link with no protocol, such as `/page` or `//host`, which would
 * resolve against whatever origin shows the document.
 */
const allowedProtocols: ReadonlySet<string> = new Set(['http', 'https', 'mailto'])

const startsWithScheme = /^([a-z][a-z0-9+.-]*):/i
// After `http:` or `https:` a host must follow, whatever slashes come first.
const hasHost = /^[/\\]*[^/\\]/

/** The address as a browser's URL parser reads it: without the controls and spaces around it, and without tabs and newlines inside. */
function asParsed(href: string): string {
  let start = 0
  let end = href.length
  // Code points up to U+0020 are the C0 controls and the space.
  while (start < end && (href.codePointAt(start) ?? 0) <= 0x20) start += 1
  while (end > start && (href.codePointAt(end - 1) ?? 0) <= 0x20) end -= 1
  return href.slice(start, end).replaceAll('\t', '').replaceAll('\n', '').replaceAll('\r', '')
}

/**
 * Whether a link's address is one a document may hold. It reads the scheme the way a browser would, which is how
 * `java\tscript:` and `JaVaScRiPt:` get past a naive check: the parser drops tabs, newlines and the spaces around the
 * address, and reads the scheme without regard to case. It does not use `URL`, so the package needs no DOM and no Node
 * types, and runs wherever the schema does.
 */
export function isAllowedLinkHref(href: string | null | undefined): href is string {
  if (!href) return false
  const parsed = asParsed(href)
  const scheme = startsWithScheme.exec(parsed)?.[1]?.toLowerCase()
  if (scheme === undefined || !allowedProtocols.has(scheme)) return false
  const rest = parsed.slice(scheme.length + 1)
  return scheme === 'mailto' ? rest !== '' : hasHost.test(rest)
}
