import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { expect, test } from './fixtures.ts'

/**
 * The identity proxy and its cookie belong to the servers of development and preview, which the suite starts with the
 * targets in the environment. A production build holds nothing of them: not the name of the cookie, nor the header it
 * becomes, nor the variables that turn the proxy on. Whether a server that is started without the variables has the
 * proxy at all is the unit test of `vite.config.ts`.
 */
const appRoot = resolve(import.meta.dirname, '..')

/** What only the proxy and the suite know. */
const identityMarkers = ['dr_dev_user', 'x-dev-user', 'E2E_API_ORIGIN', 'E2E_COLLAB_ORIGIN']

function buildProduction(outDirectory: string) {
  const vite = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin/vite.js')
  // The proxy's variables are what is taken away from the environment of the build: they must not matter to it.
  const { E2E_API_ORIGIN: _api, E2E_COLLAB_ORIGIN: _collaboration, ...environment } = process.env
  execFileSync(process.execPath, [vite, 'build', '--mode', 'production', '--outDir', outDirectory, '--emptyOutDir'], {
    cwd: appRoot,
    env: environment,
    stdio: 'pipe',
  })
}

const contentsOf = (directory: string) =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))

test('a production build holds nothing of the identity proxy or of its cookie', async () => {
  test.setTimeout(180_000)
  const directory = mkdtempSync(join(tmpdir(), 'draftroom-collab-production-'))
  try {
    buildProduction(directory)
    const files = contentsOf(directory)

    // The search can see what it looks for: a header of the real client is in the bundle, so an empty answer is not blindness.
    expect(files.some((content) => content.includes('X-CSRF-Token'))).toBe(true)
    const found = identityMarkers.filter((marker) => files.some((content) => content.includes(marker)))
    expect(found).toEqual([])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
