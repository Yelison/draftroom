/** What the gate keeps in the router's state when it sends a person to sign in: where they were going. */
export interface RedirectState {
  readonly from: string
}

/** The page a person was on, as the state to keep through the sign-in. */
export function redirectState({
  pathname,
  search,
  hash,
}: {
  pathname: string
  search: string
  hash: string
}): RedirectState {
  return { from: `${pathname}${search}${hash}` }
}

/** The pages that sign in, which a person who has just signed in is not sent back to. */
const authPaths = ['/sign-in', '/sign-up']

/**
 * Where a person goes once signed in: where they were going, if the state names a page of this app, and the home page in
 * any other case. The state is the router's and not the address bar's, so a link cannot set it; it is checked all the same,
 * because a redirect that follows whatever it is given is how a sign-in page becomes a way to another site. A path
 * counts only if it starts with one slash that is not followed by a slash or a backslash, which browsers read as the
 * start of a host.
 */
export function destinationAfterSignIn(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state) || typeof state.from !== 'string') return '/'
  const { from } = state
  if (!/^\/(?![/\\])/.test(from)) return '/'
  const pathname = from.split(/[?#]/, 1)[0] ?? ''
  return authPaths.includes(pathname) ? '/' : from
}
