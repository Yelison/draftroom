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

  const database = 'postgres://draftroom:draftroom@127.0.0.1:1/draftroom'
  const production = {
    NODE_ENV: 'production',
    DATABASE_URL: database,
    SESSION_SECRET: 'a-secret-of-at-least-thirty-two-characters',
    ALLOWED_ORIGINS: 'https://draftroom.example',
  }

  // What a deployment can get wrong, and the server refuses to start with (threat table: development identity in production).
  it.each([
    ['without a session secret', { ...production, SESSION_SECRET: '' }, 'SESSION_SECRET'],
    [
      'with a session secret that is too short to be one',
      { ...production, SESSION_SECRET: 'secret' },
      'SESSION_SECRET',
    ],
    ['without the origins that may call it', { ...production, ALLOWED_ORIGINS: '' }, 'ALLOWED_ORIGINS'],
    ['with an origin of any site', { ...production, ALLOWED_ORIGINS: '*' }, 'ALLOWED_ORIGINS'],
    ['with a proxy that is trusted whoever it is', { ...production, TRUST_PROXY: 'true' }, 'TRUST_PROXY'],
    [
      'with the environment written in capitals, which is not production',
      { ...production, NODE_ENV: 'Production' },
      'NODE_ENV',
    ],
  ])('refuses to start in production %s', (_name, environment, variable) => {
    const run = start(environment)

    expect(run.status).toBe(1)
    expect(run.stderr).toContain('Invalid configuration')
    expect(run.stderr).toContain(variable)
  })
})
