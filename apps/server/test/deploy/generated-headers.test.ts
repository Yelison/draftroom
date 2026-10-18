import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adapt, deploy, routesOfTheSite } from './caddy.ts'

// What the `web-build` stage of the Dockerfile produces and the proxy image carries: the fixed headers with the full policy of
// the page (ADR 0017). Asked of Caddy itself, like the file of the repository in `caddy-fragment.test.ts`.

const generator = new URL('../../../web/scripts/security-headers-caddy.ts', import.meta.url).pathname
const fixedHeaders = join(deploy, 'security-headers.caddy')
const scripts = [
  'try{document.documentElement.dataset.first=1}catch{}',
  'try{document.documentElement.dataset.second=1}catch{}',
]
const sha256 = (source: string) => `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`

let directory: string
let generated: string
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'draftroom-generated-'))
  const page = join(directory, 'index.html')
  writeFileSync(
    page,
    `<!doctype html><html><head><meta charset="UTF-8" />${scripts.map((script) => `<script>${script}</script>`).join('')}<script type="module" src="/assets/index.js"></script></head></html>`,
  )
  generated = execFileSync(process.execPath, [generator, page, fixedHeaders], { encoding: 'utf8' })
})
afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe('the generated headers, adapted with the Caddyfile that imports them', () => {
  it('are accepted by Caddy: the proxy of the image starts with them', async () => {
    const outcome = await adapt(generated)

    expect(outcome.stderr).not.toContain('unrecognized directive')
    expect(outcome.code).toBe(0)
  }, 60_000)

  it('put the whole policy on the files of the web app: the hash of each script, no frames, connections to its own host', async () => {
    const outcome = await adapt(generated)

    const files = routesOfTheSite(outcome.stdout).find(({ text }) => text.includes('"handler":"file_server"'))
    const text = files?.text ?? ''
    for (const script of scripts) expect(text).toContain(sha256(script))
    expect(text).toContain("frame-ancestors 'none'")
    expect(text).toContain("connect-src 'self' wss://{http.request.hostport}")
  }, 60_000)

  it('keep what the deployment fixed: HSTS without subdomains, COOP, the removal of Server', async () => {
    const outcome = await adapt(generated)

    const files = routesOfTheSite(outcome.stdout).find(({ text }) => text.includes('"handler":"file_server"'))
    expect(files?.text).toContain('max-age=31536000')
    expect(files?.text).not.toContain('includeSubDomains')
    expect(files?.text).toContain('same-origin')
    expect(files?.text).toContain('"delete":["Server"]')
    expect(readFileSync(fixedHeaders, 'utf8')).toContain('Cross-Origin-Opener-Policy "same-origin"')
  }, 60_000)

  it.each(['/api/*', '/collab*'])(
    'add no policy to %s, where the server sets its own',
    async (path) => {
      const outcome = await adapt(generated)

      const answered = routesOfTheSite(outcome.stdout).find((each) => each.path === path)
      expect(answered?.text).not.toContain('Content-Security-Policy')
    },
    60_000,
  )
})
