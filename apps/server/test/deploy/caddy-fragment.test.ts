import { execFile } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

// The contract of deploy/security-headers.caddy (ADR 0016): exactly the `header { … }` block that the Caddyfile imports inside
// the block that serves the web app. This is asked of Caddy itself, with the image the Dockerfile pins, because a fragment of
// another shape (a named snippet, say) is only found out when the proxy fails to start.

const run = promisify(execFile)
const deploy = new URL('../../../../deploy/', import.meta.url).pathname
const dockerfile = new URL('../../../../Dockerfile', import.meta.url).pathname

/** The image the proxy is built from, as the Dockerfile pins it: the one place that says which Caddy this is. */
function caddyImage(): string {
  const image = /^ARG CADDY_IMAGE=(\S+)$/m.exec(readFileSync(dockerfile, 'utf8'))?.[1]
  if (image === undefined) throw new Error('The Dockerfile pins no CADDY_IMAGE')
  return image
}

const fragmentHeaders = [
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Cross-Origin-Opener-Policy',
  'Content-Security-Policy',
]

let directory: string
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'draftroom-caddy-'))
})
afterAll(() => rmSync(directory, { recursive: true, force: true }))

interface Adapted {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/** `caddy adapt` of the Caddyfile with this fragment beside it, where the image has them: it starts nothing. */
async function adapt(fragment: string): Promise<Adapted> {
  const configuration = mkdtempSync(join(directory, 'config-'))
  copyFileSync(join(deploy, 'Caddyfile'), join(configuration, 'Caddyfile'))
  writeFileSync(join(configuration, 'security-headers.caddy'), fragment)
  try {
    const { stdout, stderr } = await run(
      'docker',
      [
        'run',
        '--rm',
        '--env',
        'SITE_ADDRESS=example.test',
        '--env',
        'PUBLIC_ORIGIN=https://example.test',
        '--volume',
        `${configuration}:/etc/caddy:ro`,
        caddyImage(),
        'caddy',
        'adapt',
        '--config',
        '/etc/caddy/Caddyfile',
        '--adapter',
        'caddyfile',
      ],
      { env: { PATH: process.env['PATH'] ?? '' }, maxBuffer: 8 * 1024 * 1024 },
    )
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string }
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
  }
}

const realFragment = readFileSync(join(deploy, 'security-headers.caddy'), 'utf8')

// Only the parts of the adapted configuration that say which route does what.
const route = z.looseObject({ match: z.array(z.looseObject({ path: z.array(z.string()).optional() })).optional() })
const adaptedSite = z.object({
  apps: z.object({
    http: z.object({
      servers: z.record(
        z.string(),
        z.object({
          routes: z.array(z.object({ handle: z.array(z.looseObject({ routes: z.array(route).optional() })) })),
        }),
      ),
    }),
  }),
})

/** The routes of the web app's site, as the text each one adapts to: `/collab*`, `/api/*` and the one for everything else. */
function routesOfTheSite(output: string): { readonly path: string; readonly text: string }[] {
  const servers = Object.values(adaptedSite.parse(JSON.parse(output)).apps.http.servers)
  return servers
    .flatMap((server) => server.routes)
    .flatMap(({ handle }) => handle.flatMap((handler) => handler.routes ?? []))
    .map((each) => ({ path: each.match?.[0]?.path?.[0] ?? '*', text: JSON.stringify(each) }))
}

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
