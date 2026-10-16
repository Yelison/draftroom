import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const entryPoint = new URL('./run.ts', import.meta.url)
// Nothing listens there: a run that gets as far as the database fails to connect, and one that stops first never tries.
const unreachable = 'postgres://draftroom:draftroom@127.0.0.1:1/draftroom'

function run(environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [entryPoint.pathname], {
    env: { PATH: process.env['PATH'], ...environment },
    encoding: 'utf8',
    timeout: 20_000,
  })
}

describe('the demo seed command', () => {
  it.each([
    ['production', { NODE_ENV: 'production' }],
    ['not set', {}],
    ['empty', { NODE_ENV: '' }],
  ])('refuses to run when NODE_ENV is %s, before it reaches for the database', (_name, environment) => {
    const result = run({ DATABASE_URL: unreachable, ...environment })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('runs only with NODE_ENV set to development or test')
    expect(result.stderr).not.toMatch(/ECONNREFUSED|connect/i)
  })

  it.each(['development', 'test'])('goes on to the database when NODE_ENV is set to %s', (nodeEnv) => {
    const result = run({ NODE_ENV: nodeEnv, DATABASE_URL: unreachable })

    // It was let through, and then failed to connect to a database that is not there.
    expect(result.status).not.toBe(0)
    expect(result.stderr).not.toContain('runs only with NODE_ENV')
  })

  it('refuses to run without a database, and says so', () => {
    const result = run({ NODE_ENV: 'development' })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('DATABASE_URL')
  })
})
