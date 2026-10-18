// The headers of the document, as the `header { … }` block the Caddyfile of the deployment imports inside the block that
// serves the web app's files (docs/decisions/0016 and 0017). The proxy adds no document header to `/api` or `/collab`: the
// server sets its own there.
//
// It starts from `deploy/security-headers.caddy`, which holds the fixed headers the deployment decided on, and changes one
// thing: the `Content-Security-Policy` line becomes the whole policy of the page, with the hash of every inline script of the
// built `index.html` and what only a header can say (`frame-ancestors`). Everything else, comments included, is kept as it
// is, so a decision in that file (HSTS without `includeSubDomains`, COOP, `-Server`) is never overwritten by this one.
//
// Usage: node scripts/security-headers-caddy.ts dist/index.html deploy/security-headers.caddy > security-headers.caddy
import { readFileSync } from 'node:fs'
import { contentSecurityPolicy, inlineScripts, scriptSource } from './content-security-policy.ts'

/**
 * What the page may connect to, as the proxy says it: the origin it answers on and its WebSocket. The page's own `<meta>`
 * allows `wss:` because the build does not know the host; the browser applies both policies, so the proxy narrows it to this
 * host. `{hostport}` is Caddy's placeholder for the `Host` of the request, port included, so an HTTPS port other than 443
 * works too.
 */
const connectSources = ["'self'", 'wss://{hostport}']

const policyLine = /^(\s*)Content-Security-Policy\s+"[^"\n]*"\s*$/m

/** `base` (the fixed headers) with its policy replaced by the full one of the page `html`. */
export function securityHeadersCaddy(html: string, base: string): string {
  const scripts = inlineScripts(html)
  if (scripts.length === 0) throw new Error('The page has no inline script: was it built?')
  if (!policyLine.test(base)) throw new Error('The fixed headers have no Content-Security-Policy line to replace')
  const policy = contentSecurityPolicy(scripts.map(scriptSource), { asHeader: true, connectSources })
  return base.replace(policyLine, (_line, indent: string) => `${indent}Content-Security-Policy "${policy}"`)
}

if (import.meta.main) {
  const [page, base] = process.argv.slice(2)
  if (page === undefined || base === undefined) {
    throw new Error('Usage: security-headers-caddy.ts <built index.html> <fixed headers, security-headers.caddy>')
  }
  process.stdout.write(securityHeadersCaddy(readFileSync(page, 'utf8'), readFileSync(base, 'utf8')))
}
