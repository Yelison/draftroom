import type { FastifyRequest } from 'fastify'

// The boundary between the routes and whoever says who is calling. Routes only ever see a `Principal`; how it was
// found (a development header today, a session cookie and a CSRF token in T7.1) is the provider's business, so signing
// in changes the provider and not a single route.

export interface Principal {
  readonly userId: string
  /**
   * The opaque id of the session the caller signed in with, for a provider that has sessions. The collaboration server
   * finds the connections of a session that ends by a keyed hash of it (protocol §6.3); a provider without sessions,
   * such as the development identity, leaves it out and its connections can only be found by person or document.
   */
  readonly sessionId?: string | undefined
}

/** What the operation asked for beyond a session. */
export interface AuthRequirement {
  /** The method changes state, so the provider also has to verify the CSRF token. */
  readonly csrf: boolean
}

/** The first two checks of the order in `docs/api/README.md`: the session (401), then the CSRF token (403). */
export type Authentication =
  | { readonly status: 'authenticated'; readonly principal: Principal }
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'csrf-rejected' }

/** What a provider reads of a request: its headers, which carry a development header today and cookies and the CSRF token later. */
export type AuthRequest = Pick<FastifyRequest, 'headers'>

export interface AuthProvider {
  authenticate(request: AuthRequest, requirement: AuthRequirement): Promise<Authentication>
}
