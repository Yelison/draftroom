import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adapt, deploy, routesOfTheSite } from './caddy.ts'

// The contract of deploy/security-headers.caddy (ADR 0016): exactly the `header { … }` block that the Caddyfile imports inside
// the block that serves the web app. This is asked of Caddy itself, with the image the Dockerfile pins, because a fragment of
// another shape (a named snippet, say) is only found out when the proxy fails to start.

const fragmentHeaders = [
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Cross-Origin-Opener-Policy',
  'Content-Security-Policy',
]

const realFragment = readFileSync(join(deploy, 'security-headers.caddy'), 'utf8')

describe('deploy/security-headers.caddy, adapted with the Caddyfile that imports it', () => {
  it('is accepted by Caddy as it is', async () => {
    const outcome = await adapt(realFragment)

    expect(outcome.stderr).not.toContain('unrecognized directive')
    expect(outcome.code).toBe(0)
  }, 60_000)

  it('gives the files of the web app every header it names, and removes Server', async () => {
    const outcome = await adapt(realFragment)

    const files = routesOfTheSite(outcome.stdout).find(({ text }) => text.includes('"handler":"file_server"'))
    expect(files, 'a route for the files of the web app').toBeDefined()
    for (const header of fragmentHeaders) expect(files?.text, header).toContain(header)
    expect(files?.text).toContain('"delete":["Server"]')
  }, 60_000)

  it('sets them nowhere but on those files: not for the whole site, which would reach /api and /collab', async () => {
    const outcome = await adapt(realFragment)

    const files = routesOfTheSite(outcome.stdout).find(({ text }) => text.includes('"handler":"file_server"'))
    const occurrences = (text: string, header: string) => text.split(header).length - 1
    for (const header of fragmentHeaders) {
      expect(occurrences(outcome.stdout, header), header).toBe(occurrences(files?.text ?? '', header))
    }
  }, 60_000)

  it.each(['/api/*', '/collab*'])(
    'gives %s none of them, which the server answers with its own',
    async (path) => {
      const outcome = await adapt(realFragment)

      const answered = routesOfTheSite(outcome.stdout).find((each) => each.path === path)
      expect(answered, `a route for ${path}`).toBeDefined()
      for (const header of fragmentHeaders) expect(answered?.text, header).not.toContain(header)
    },
    60_000,
  )

  it('does not accept the same headers written as a named snippet, the other shape a generator could choose', async () => {
    const snippet = `(security_headers) {\n\theader {\n\t\tStrict-Transport-Security "max-age=31536000"\n\t}\n}\n`

    const outcome = await adapt(snippet)

    expect(outcome.code).not.toBe(0)
    expect(outcome.stderr).toContain('unrecognized directive')
  }, 60_000)
})
