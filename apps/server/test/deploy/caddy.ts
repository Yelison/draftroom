import { execFile } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'

// Asking Caddy itself about the Caddyfile of the deployment with a given `security-headers.caddy` beside it. A fragment of the
// wrong shape (a named snippet, say) is only found out when the proxy fails to start, so the tests ask the image the Dockerfile pins.

const run = promisify(execFile)
export const deploy = new URL('../../../../deploy/', import.meta.url).pathname
const dockerfile = new URL('../../../../Dockerfile', import.meta.url).pathname

/** The image the proxy is built from, as the Dockerfile pins it: the one place that says which Caddy this is. */
function caddyImage(): string {
  const image = /^ARG CADDY_IMAGE=(\S+)$/m.exec(readFileSync(dockerfile, 'utf8'))?.[1]
  if (image === undefined) throw new Error('The Dockerfile pins no CADDY_IMAGE')
  return image
}

export interface Adapted {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/** `caddy adapt` of the Caddyfile with this fragment beside it, where the image has them: it starts nothing. */
export async function adapt(fragment: string): Promise<Adapted> {
  const configuration = mkdtempSync(join(tmpdir(), 'draftroom-caddy-'))
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
  } finally {
    rmSync(configuration, { recursive: true, force: true })
  }
}

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
export function routesOfTheSite(output: string): { readonly path: string; readonly text: string }[] {
  const servers = Object.values(adaptedSite.parse(JSON.parse(output)).apps.http.servers)
  return servers
    .flatMap((server) => server.routes)
    .flatMap(({ handle }) => handle.flatMap((handler) => handler.routes ?? []))
    .map((each) => ({ path: each.match?.[0]?.path?.[0] ?? '*', text: JSON.stringify(each) }))
}
