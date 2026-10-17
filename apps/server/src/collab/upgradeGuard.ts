import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Extension } from '@hocuspocus/server'
import { securityHeaders } from '../http/security.ts'
import type { OpenSockets } from './openSockets.ts'

// The check before the WebSocket handshake (protocol §3.2). The session cookie is protected across sites by
// `SameSite=Lax`; this is defence in depth against sibling sites, which a browser would let send the cookie.

export interface OriginPolicy {
  readonly allowedOrigins: readonly string[]
  /** An explicit `NODE_ENV` of `development` or `test`, where a client that sends no `Origin` is the tests and the tools. */
  readonly development: boolean
}

/** A browser always sends `Origin`, so a request without one is accepted only where there are no browsers to protect. */
export function isOriginAllowed(origin: string | undefined, { allowedOrigins, development }: OriginPolicy): boolean {
  return origin === undefined ? development : allowedOrigins.includes(origin)
}

const forbidden = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'

export interface UpgradeGuardPolicy extends OriginPolicy {
  /** Whether the server is in production, which decides if its answers carry HSTS (`securityHeaders`). */
  readonly production: boolean
}

export function upgradeGuardExtension(policy: UpgradeGuardPolicy, sockets: OpenSockets): Extension {
  const headers = securityHeaders({ production: policy.production })
  return {
    extensionName: 'draftroom-upgrade-guard',

    // The port speaks WebSocket and nothing else. Hocuspocus would answer a plain request with its welcome text, which says
    // what is running here; answer `404`, with the headers of every answer of the API, and stop it from adding its own.
    async onRequest({ response }: { response: ServerResponse }) {
      response.writeHead(404, { ...headers, 'content-length': 0 })
      response.end()
      return Promise.reject(undefined)
    },

    async onUpgrade({ request, socket }: { request: IncomingMessage; socket: Duplex }) {
      if (isOriginAllowed(request.headers.origin, policy)) {
        sockets.track(socket)
        return
      }
      socket.write(forbidden, () => socket.destroy())
      // Rejecting with nothing is how a hook says it has handled the request: Hocuspocus then does not upgrade.
      return Promise.reject(undefined)
    },
  }
}
