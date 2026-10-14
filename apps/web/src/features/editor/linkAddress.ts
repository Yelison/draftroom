import { isAllowedLinkHref } from '@draftroom/editor-schema'

// A scheme is a word and a colon, unless digits follow: `example.com:8080` is a host and a port, not a scheme.
const startsWithScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i
const looksLikeEmail = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/

/**
 * The address to store for what a person typed in the link field, or `null` when a document may not hold it. What they
 * typed is read the way people mean it: `example.com` is `https://example.com` and `ana@example.com` a mail link. What
 * names a protocol must already be one of the allowed ones, so `javascript:alert(1)` is refused, not repaired.
 */
export function linkAddressFrom(typed: string): string | null {
  const text = typed.trim()
  if (text === '') return null
  // An address with no scheme is a domain or an email, and neither has a space or a tab in it: text that does is not
  // completed into one. (A scheme broken by a tab would otherwise become the host of an `https` address.)
  if (!startsWithScheme.test(text) && /\s/.test(text)) return null
  const address = startsWithScheme.test(text) ? text : looksLikeEmail.test(text) ? `mailto:${text}` : `https://${text}`
  return isAllowedLinkHref(address) ? address : null
}
