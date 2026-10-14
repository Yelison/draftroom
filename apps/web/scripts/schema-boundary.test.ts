import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The conversion between JSON and a Yjs update (`@draftroom/editor-schema/convert`) is for the server: a client opens the
 * stored Yjs state as it is and never rebuilds a document from JSON. The lint configuration forbids the import in the web
 * app's sources, tests excepted (a test may ask what the server would accept of the editor's state). This runs the real
 * linter, with the repository's own configuration, on a copy of the app's layout holding a file that breaks the rule and a
 * test that does not, so the rule is proved to fail where it must and to pass where it may.
 */
const repository = resolve(import.meta.dirname, '../../..')
const oxlint = join(dirname(createRequire(import.meta.url).resolve('oxlint/package.json')), 'bin/oxlint')
const importsConvert =
  "import { jsonToYUpdate } from '@draftroom/editor-schema/convert'\nexport const leak = jsonToYUpdate\n"

let directory: string

function lint(file: string) {
  const run = spawnSync(oxlint, ['-c', '.oxlintrc.json', file], { cwd: directory, encoding: 'utf8' })
  return { failed: run.status !== 0, output: run.stdout + run.stderr }
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'draftroom-boundary-'))
  copyFileSync(join(repository, '.oxlintrc.json'), join(directory, '.oxlintrc.json'))
  mkdirSync(join(directory, 'apps/web/src/features'), { recursive: true })
  for (const file of ['source.ts', 'features/Screen.tsx', 'source.test.ts', 'features/Screen.test.tsx']) {
    writeFileSync(join(directory, 'apps/web/src', file), importsConvert)
  }
  mkdirSync(join(directory, 'apps/server/src'), { recursive: true })
  writeFileSync(join(directory, 'apps/server/src/source.ts'), importsConvert)
})

afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe('the conversion between JSON and Yjs', () => {
  it.each(['apps/web/src/source.ts', 'apps/web/src/features/Screen.tsx'])(
    'cannot be imported by the web app: %s',
    (file) => {
      const { failed, output } = lint(file)

      expect(failed).toBe(true)
      expect(output).toContain('no-restricted-imports')
      expect(output).toContain('@draftroom/editor-schema/convert')
    },
  )

  it.each(['apps/web/src/source.test.ts', 'apps/web/src/features/Screen.test.tsx'])(
    'may be imported by a test of the web app: %s',
    (file) => {
      expect(lint(file).failed).toBe(false)
    },
  )

  it('may be imported by the server', () => {
    expect(lint('apps/server/src/source.ts').failed).toBe(false)
  })
})
