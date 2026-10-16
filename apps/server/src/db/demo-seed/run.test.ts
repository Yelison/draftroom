import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const entryPoint = new URL('./run.ts', import.meta.url)

function run(environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [entryPoint.pathname], {
    env: { PATH: process.env['PATH'], ...environment },
    encoding: 'utf8',
    timeout: 20_000,
  })
}

describe('the demo seed command', () => {
  it('refuses to run in production, before it reaches for the database', () => {
    const result = run({ NODE_ENV: 'production', DATABASE_URL: 'postgres://draftroom:draftroom@127.0.0.1:1/draftroom' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('does not run with NODE_ENV=production')
  })

  it('refuses to run without a database, and says so', () => {
    const result = run({})

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('DATABASE_URL')
  })
})
