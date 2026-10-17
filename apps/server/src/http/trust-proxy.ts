import { isIP } from 'node:net'
import { z } from 'zod'

/** What Fastify's `trustProxy` takes, less the ways to get it wrong: `true`, a number of hops and a function. */
export type TrustProxy = false | string[]

const keywords: ReadonlySet<string> = new Set(['loopback', 'linklocal', 'uniquelocal'])

/** An address, or an address and the length of its prefix (`10.0.0.0/8`), as `proxy-addr` reads them. */
function isAddressOrRange(entry: string): boolean {
  const [address = '', prefix, ...rest] = entry.split('/')
  const family = isIP(address)
  if (family === 0 || rest.length > 0) return false
  if (prefix === undefined) return true
  // `/0` is every address: it would trust anybody, and `proxy-addr` refuses it with a stack trace at start-up.
  return /^\d{1,3}$/.test(prefix) && Number(prefix) >= 1 && Number(prefix) <= (family === 4 ? 32 : 128)
}

const message =
  'must be a comma-separated list of the addresses or ranges of the proxies in front of the server, or loopback, ' +
  'linklocal and uniquelocal; "true" would believe any caller who writes X-Forwarded-For, and a number of hops ' +
  'cannot tell the proxy from the caller (Fastify 5 trusts nothing for it)'

/**
 * The `TRUST_PROXY` variable. Behind a reverse proxy the address of every request is the proxy's, so the limit per
 * address would be one limit for everybody; trusting `X-Forwarded-For` with no proxy lets anyone choose their address and
 * go round it. Nothing is trusted unless the deployment says who the proxies are, by address.
 */
export const trustProxy = z
  .string()
  .default('')
  .transform((value, context): TrustProxy => {
    const entries = value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
    if (entries.length === 0) return false
    if (entries.every((entry) => keywords.has(entry) || isAddressOrRange(entry))) return entries
    context.addIssue({ code: 'custom', message })
    return z.NEVER
  })
