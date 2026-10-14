import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const entryPoint = new URL('./main.ts', import.meta.url)

function start(environment: NodeJS.ProcessEnv) {
  // Node runs the TypeScript source itself, as in production: no build and no loader.
  return spawnSync(process.execPath, [entryPoint.pathname], {
    env: { PATH: process.env['PATH'], ...environment },
    encoding: 'utf8',
    timeout: 20_000,
  })
}

describe('the entry point', () => {
  it('refuses to start without a database and says so, instead of failing later', () => {
    const run = start({})

    expect(run.status).toBe(1)
    expect(run.stderr).toContain('Invalid configuration')
    expect(run.stderr).toContain('DATABASE_URL')
  })

  it('refuses to start in production without a session secret', () => {
    const run = start({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://draftroom:draftroom@127.0.0.1:1/draftroom',
      ALLOWED_ORIGINS: 'https://draftroom.example',
    })

    expect(run.status).toBe(1)
    expect(run.stderr).toContain('SESSION_SECRET')
  })
})
