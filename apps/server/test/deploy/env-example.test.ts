import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// What `cp deploy/env.example deploy/.env` gives somebody who then starts the stack without reading the file.

const run = promisify(execFile)
const deploy = new URL('../../../../deploy/', import.meta.url).pathname

let directory: string
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'draftroom-env-example-'))
})
afterAll(() => rmSync(directory, { recursive: true, force: true }))

/** `docker compose config` resolves the file, with the variables of the environment file, without starting anything. */
async function config(environmentFile: string): Promise<{ readonly code: number; readonly stderr: string }> {
  try {
    await run(
      'docker',
      ['compose', '--env-file', environmentFile, '-f', join(deploy, 'docker-compose.prod.yml'), 'config', '--quiet'],
      {
        env: { PATH: process.env['PATH'] ?? '' },
      },
    )
    return { code: 0, stderr: '' }
  } catch (error) {
    const failure = error as { code?: number; stderr?: string }
    return { code: failure.code ?? 1, stderr: failure.stderr ?? '' }
  }
}

const secrets = ['SESSION_SECRET', 'POSTGRES_PASSWORD'] as const

/** The example with every secret filled in except those named: what somebody who edited only part of it has. */
function editedExcept(name: string, left: readonly string[]): string {
  const file = join(directory, name)
  const filled = secrets.filter((secret) => !left.includes(secret))
  const lines = readFileSync(join(deploy, 'env.example'), 'utf8')
    .split('\n')
    .map((line) => {
      const secret = filled.find((candidate) => line === `${candidate}=`)
      return secret === undefined ? line : `${secret}=${randomBytes(24).toString('hex')}`
    })
  writeFileSync(file, lines.join('\n'))
  return file
}

describe('deploy/env.example, copied and not edited', () => {
  it('does not let the stack start, and names what is missing', async () => {
    const copy = join(directory, 'unedited.env')
    copyFileSync(join(deploy, 'env.example'), copy)

    const outcome = await config(copy)

    expect(outcome.code).not.toBe(0)
    expect(outcome.stderr).toMatch(/SESSION_SECRET|POSTGRES_PASSWORD/)
  })

  it.each(secrets)('does not let it start with only %s left empty, and says which', async (empty) => {
    const outcome = await config(editedExcept(`only-${empty}.env`, [empty]))

    expect(outcome.code).not.toBe(0)
    expect(outcome.stderr).toContain(empty)
  })

  it('lets it start once both secrets have values, so that the refusals above are about them and nothing else', async () => {
    const outcome = await config(editedExcept('edited.env', []))

    expect(outcome.stderr).toBe('')
    expect(outcome.code).toBe(0)
  })
})
