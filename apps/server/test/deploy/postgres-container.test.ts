import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Which database the backup scripts take when nobody says. The development Compose project is `draftroom` and the production
// one `draftroom-prod`; a script that defaulted to the first would back up, or restore over, the development database of
// whoever forgot a variable. A `docker` that only records what it was asked stands in for Docker: no container is needed.

const library = new URL('../../../../deploy/lib/postgres-container.sh', import.meta.url).pathname

describe('the database the backup scripts find without being told which', () => {
  let directory: string
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'draftroom-docker-stub-'))
    writeFileSync(
      join(directory, 'docker'),
      `#!/usr/bin/env bash\necho "$@" >> "${directory}/asked"\necho container-id\n`,
    )
    chmodSync(join(directory, 'docker'), 0o755)
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  const find = (environment: Record<string, string>) => {
    const found = execFileSync('bash', ['-c', `source "${library}" && find_postgres_container`], {
      env: { PATH: `${directory}:${process.env['PATH'] ?? ''}`, ...environment },
      encoding: 'utf8',
    })
    return { found: found.trim(), asked: readFileSync(join(directory, 'asked'), 'utf8') }
  }

  it('is the postgres service of the production project', () => {
    const { found, asked } = find({})
    expect(found).toBe('container-id')
    expect(asked).toContain('label=com.docker.compose.project=draftroom-prod ')
    expect(asked).toContain('label=com.docker.compose.service=postgres')
  })

  it('is the project the environment names, when it names one', () => {
    expect(find({ COMPOSE_PROJECT_NAME: 'draftroom-drill' }).asked).toContain('project=draftroom-drill ')
  })
})
