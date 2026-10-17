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

describe('deploy/env.example, copied and not edited', () => {
  it('does not let the stack start, and names what is missing', async () => {
    const copy = join(directory, 'unedited.env')
    copyFileSync(join(deploy, 'env.example'), copy)

    const outcome = await config(copy)

    expect(outcome.code).not.toBe(0)
    expect(outcome.stderr).toMatch(/SESSION_SECRET|POSTGRES_PASSWORD/)
  })

  it('lets it start once both secrets have values, so that the refusal above is about them and nothing else', async () => {
    const edited = join(directory, 'edited.env')
    const secrets = `SESSION_SECRET=${randomBytes(32).toString('hex')}\nPOSTGRES_PASSWORD=${randomBytes(24).toString('hex')}\n`
    writeFileSync(
      edited,
      readFileSync(join(deploy, 'env.example'), 'utf8').replace(/^(?:SESSION_SECRET|POSTGRES_PASSWORD)=$/gm, '') +
        secrets,
    )

    const outcome = await config(edited)

    expect(outcome.stderr).toBe('')
    expect(outcome.code).toBe(0)
  })
})
