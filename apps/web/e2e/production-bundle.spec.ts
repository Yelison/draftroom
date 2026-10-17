import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { seed } from '../src/data/mock/fixtures/index.ts'
import { expect, test } from './fixtures.ts'

/**
 * A production build, the one that talks to the real API, holds nothing of the mock: no module of it, no person or
 * document of its fixtures, no trace of the mode. The mock is demo data and a way to answer without a server, and the
 * real app must never ship either. It also holds nothing of the test tooling (the schema validator and the YAML
 * parser), which only the tests may import.
 *
 * The build is made here, into a directory of its own, so it never overwrites `dist/`, which the suite serves with the
 * mock inside (and which doubles as the control: what this spec looks for is there, so a search that finds nothing in
 * the production build is not a search that cannot see).
 */
const appRoot = resolve(import.meta.dirname, '..')
const servedBuild = join(appRoot, 'dist')

/** Where text a person reads lives in the fixtures: names, titles, emails, excerpts, comments, templates. */
const readableKeys = new Set(['name', 'title', 'email', 'excerpt', 'quote', 'body', 'description', 'label', 'password'])

function readableTexts(node: unknown, key?: string): string[] {
  if (typeof node === 'string') return key !== undefined && readableKeys.has(key) ? [node] : []
  if (Array.isArray(node)) return node.flatMap((child) => readableTexts(child, key))
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([childKey, child]) => readableTexts(child, childKey))
  }
  return []
}

const fixtureTexts = [...new Set(readableTexts(seed))]

/** What only the mock or the test tooling has: the mock's own words and the messages of the validator and the parser. */
const forbiddenMarkers = [
  // The choice of data source is made when the app is built and leaves no value behind in a build for the real API.
  'VITE_DATA_SOURCE',
  '"mock"',
  "'mock'",
  'UnhandledOperationError',
  'The mock does not implement',
  'createMockDataSource',
  'YAMLParseError',
  // The vocabulary URLs of the 2020-12 metaschema, which only the schema validator carries. The `$schema` URL itself is
  // not a marker: zod, which the client runs to read what the collaboration server sends, writes it too.
  'json-schema.org/draft/2020-12/vocab',
  // The reason the simulated collaboration server gives when it ends a connection over a message it cannot read: its own
  // text, which the real server and the client do not have. It is what tells that the simulator did not come in alone.
  'malformed-message',
]

/** What the provider and Yjs write into the chunk that holds them, and the app's own session over them. */
const collaborationMarkers = ['HocuspocusProvider', 'sessionAwareness', 'Yjs was already imported']

function filesOf(directory: string): { name: string; content: string }[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name)
      return { name: path.slice(directory.length + 1), content: readFileSync(path, 'utf8') }
    })
}

function buildProductionBundle(outDirectory: string) {
  const vite = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin/vite.js')
  // The choice must come from the mode alone: a variable of the machine running this must not turn the build into a mock.
  const { VITE_DATA_SOURCE: _ignored, ...environment } = process.env
  execFileSync(process.execPath, [vite, 'build', '--mode', 'production', '--outDir', outDirectory, '--emptyOutDir'], {
    cwd: appRoot,
    env: environment,
    stdio: 'pipe',
  })
}

// Built once for the tests of a worker, on first use: the tests are independent, so each one reports its own failure.
let built: { directory: string; files: { name: string; content: string }[] } | undefined

function productionBundle() {
  if (built === undefined) {
    const directory = mkdtempSync(join(tmpdir(), 'draftroom-production-'))
    buildProductionBundle(directory)
    built = { directory, files: filesOf(directory) }
  }
  return built.files
}

test.describe('the production bundle', () => {
  test.setTimeout(180_000)

  test.afterAll(() => {
    if (built !== undefined) rmSync(built.directory, { recursive: true, force: true })
    built = undefined
  })

  test('has files to look at', () => {
    expect(productionBundle().some(({ name }) => name.endsWith('.js'))).toBe(true)
    expect(fixtureTexts.length).toBeGreaterThan(40)
  })

  test('emits no module of the mock', () => {
    expect(
      productionBundle()
        .map(({ name }) => name)
        .filter((name) => /mock|fixture/i.test(name)),
    ).toEqual([])
  })

  test('contains no person, document or text of the fixtures', () => {
    const found = productionBundle().flatMap(({ name, content }) =>
      fixtureTexts.filter((text) => content.includes(text)).map((text) => `${name}: ${text}`),
    )

    expect(found).toEqual([])
  })

  test('contains no trace of the mock mode or of the test tooling', () => {
    const found = productionBundle().flatMap(({ name, content }) =>
      forbiddenMarkers.filter((marker) => content.includes(marker)).map((marker) => `${name}: ${marker}`),
    )

    expect(found).toEqual([])
  })

  // The collaboration is the heaviest thing an editor needs and no other screen does: it is loaded with the editor, so that
  // the first load of the app (the entry and the chunks it preloads) holds neither the provider nor Yjs.
  test('keeps the provider and Yjs out of the first load', () => {
    const files = productionBundle()
    const html = files.find(({ name }) => name === 'index.html')?.content ?? ''
    const entry = html.match(/<script[^>]*type="module"[^>]*src="\/assets\/([^"]+\.js)"/)?.[1]
    const preloaded = [...html.matchAll(/modulepreload"[^>]*href="\/assets\/([^"]+\.js)"/g)].map(([, name]) => name)
    expect(entry).toBeDefined()
    const firstLoad = files.filter(({ name }) => [entry, ...preloaded].some((chunk) => name === `assets/${chunk}`))
    expect(firstLoad.length).toBeGreaterThan(0)

    const found = firstLoad.flatMap(({ name, content }) =>
      collaborationMarkers.filter((marker) => content.includes(marker)).map((marker) => `${name}: ${marker}`),
    )

    expect(found).toEqual([])
    // The search can see them: they are in the build, in the chunk of the editor.
    for (const marker of collaborationMarkers) {
      expect(
        files.some(({ name, content }) => name.endsWith('.js') && content.includes(marker)),
        marker,
      ).toBe(true)
    }
  })

  test('is searched with texts that the build with the mock does contain', () => {
    const served = filesOf(join(servedBuild, 'assets')).filter(({ name }) => name.endsWith('.js'))
    const missing = fixtureTexts.filter((text) => !served.some(({ content }) => content.includes(text)))

    expect(missing, 'fixture texts the search could not find even where they are').toEqual([])
    // `UnhandledOperationError` is no longer here: the mock implements every operation of the client, so nothing uses it
    // and the build leaves it out. It stays on the list of what the production bundle must not hold.
    expect(served.some(({ content }) => content.includes('malformed-message'))).toBe(true)
  })
})
