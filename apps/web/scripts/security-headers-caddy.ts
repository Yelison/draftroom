// The headers of the document, as a Caddy snippet generated from the built page (ADR 0017). The proxy that serves `dist/`
// imports it inside the block that serves the files and nowhere else: `/api` and `/collab` get theirs from the server.
// The policy is the one written into the page by the build, with the hashes of the page it was built from, plus what only a
// header can say (`frame-ancestors`). Generated and not written by hand, so a script that changes cannot leave a stale hash.
//
// Usage: node scripts/security-headers-caddy.ts dist/index.html > security-headers.caddy
import { readFileSync } from 'node:fs'
import { contentSecurityPolicy, inlineScripts, scriptSource } from './content-security-policy.ts'

/** The snippet for a page: its policy as a header and the other headers a document needs behind HTTPS. */
export function securityHeadersCaddy(html: string): string {
  const scripts = inlineScripts(html)
  if (scripts.length === 0) throw new Error('The page has no inline script: was it built?')
  const policy = contentSecurityPolicy(scripts.map(scriptSource), { asHeader: true })
  return `(security_headers) {
	header {
		Content-Security-Policy "${policy}"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "no-referrer"
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()"
		Strict-Transport-Security "max-age=31536000"
	}
}
`
}

if (import.meta.main) {
  const [page] = process.argv.slice(2)
  if (page === undefined) throw new Error('Usage: security-headers-caddy.ts <built index.html>')
  process.stdout.write(securityHeadersCaddy(readFileSync(page, 'utf8')))
}
