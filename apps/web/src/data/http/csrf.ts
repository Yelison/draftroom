/**
 * The cookie the server sets with the session; its value is echoed in `X-CSRF-Token` (docs/api/README.md). Behind HTTPS
 * the server names it with the `__Host-` prefix, which a sibling subdomain cannot plant, and without HTTPS (development)
 * it has no prefix (docs/decisions/0004-authentication.md). The prefixed one is looked for first.
 */
export const csrfCookieNames = ['__Host-dr_csrf', 'dr_csrf'] as const
export const csrfHeaderName = 'X-CSRF-Token'

const methodsThatChangeState: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function changesState(method: string): boolean {
  return methodsThatChangeState.has(method.toUpperCase())
}

/** A cookie value is percent-encoded; one that is not well formed is used as it came rather than failing the request. */
function decoded(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** The value of one cookie in a `document.cookie` string, or `undefined` when it is not there. */
export function cookieValue(cookies: string, name: string): string | undefined {
  for (const pair of cookies.split(';')) {
    const separator = pair.indexOf('=')
    if (separator !== -1 && pair.slice(0, separator).trim() === name) {
      return decoded(pair.slice(separator + 1).trim())
    }
  }
  return undefined
}

/** The CSRF token the server set, read when each request is sent so a session started later is picked up. */
export function csrfTokenFromCookie(): string | undefined {
  for (const name of csrfCookieNames) {
    const token = cookieValue(document.cookie, name)
    if (token !== undefined) return token
  }
  return undefined
}
