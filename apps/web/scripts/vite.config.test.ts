import type { ConfigEnv, ProxyOptions, UserConfig, UserConfigFnObject } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import config from '../vite.config.ts'

/** The configuration Vite would use for a command and mode: the default export is a function of both. */
function resolve(env: ConfigEnv): UserConfig {
  return (config as UserConfigFnObject)(env)
}

const serve = { command: 'serve', mode: 'development' } as const
const build = { command: 'build', mode: 'production' } as const

describe('the ports', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('are left to Vite when the environment sets none', () => {
    vi.stubEnv('DEV_SERVER_PORT', '')
    vi.stubEnv('PLAYWRIGHT_PORT', '')

    expect(resolve(serve).server).toEqual({})
    expect(resolve(serve).preview).toEqual({})
  })

  it('are the ones of the environment, and strict, when it sets them', () => {
    vi.stubEnv('DEV_SERVER_PORT', '5385')
    vi.stubEnv('PLAYWRIGHT_PORT', '4385')

    expect(resolve(serve).server).toEqual({ port: 5385, strictPort: true })
    expect(resolve(serve).preview).toEqual({ port: 4385, strictPort: true })
  })
})

describe('the build modes', () => {
  it('serve the pseudo-locale build from a directory of its own', () => {
    const pseudo = resolve({ command: 'build', mode: 'pseudo' })

    expect(pseudo.base).toBe('/__pseudo__/')
    expect(pseudo.build?.outDir).toBe('dist/__pseudo__')
    expect(resolve(build).build?.outDir).toBe('dist')
  })

  it('leave the ICU parser out of the production bundle only', () => {
    expect(JSON.stringify(resolve(build).resolve?.alias)).toContain('no-parser.js')
    expect(resolve(serve).resolve?.alias).toEqual([])
  })
})

describe('the proxy of the real-stack end-to-end suite', () => {
  afterEach(() => vi.unstubAllEnvs())

  const targets = { E2E_API_ORIGIN: 'http://127.0.0.1:8384', E2E_COLLAB_ORIGIN: 'http://127.0.0.1:8484' }
  const stubTargets = (variables: Record<string, string> = targets) => {
    for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value)
  }
  const proxyOf = (env: ConfigEnv, server: 'server' | 'preview', path: '/api' | '/collab'): ProxyOptions => {
    const entry = resolve(env)[server]?.proxy?.[path]
    if (entry === undefined || typeof entry === 'string') throw new Error(`No proxy for ${path} in ${server}`)
    return entry
  }

  it.each([
    ['development', 'server'],
    ['preview', 'preview'],
  ] as const)('serves /api and /collab of the app in %s from the two servers of the stack', (_name, server) => {
    stubTargets()

    expect(proxyOf(serve, server, '/api')).toMatchObject({ target: targets.E2E_API_ORIGIN })
    expect(proxyOf(serve, server, '/collab')).toMatchObject({ target: targets.E2E_COLLAB_ORIGIN, ws: true })
  })

  it.each([
    ['no variable is set', {}],
    ['only the API is named', { E2E_API_ORIGIN: targets.E2E_API_ORIGIN }],
    ['only the collaboration server is named', { E2E_COLLAB_ORIGIN: targets.E2E_COLLAB_ORIGIN }],
  ])('does not exist when %s', (_case, variables) => {
    vi.stubEnv('E2E_API_ORIGIN', '')
    vi.stubEnv('E2E_COLLAB_ORIGIN', '')
    stubTargets(variables)

    expect(resolve(serve).server?.proxy).toBeUndefined()
    expect(resolve(serve).preview?.proxy).toBeUndefined()
  })

  it('is never part of a build, whatever the environment names', () => {
    stubTargets()

    const production = resolve(build)
    expect(production.server?.proxy).toBeUndefined()
    expect(production.preview?.proxy).toBeUndefined()
  })

  it.each(['/api', '/collab'] as const)('forwards what the browser sends to %s and rewrites nothing', (route) => {
    stubTargets()

    // A hook that touched the request could give the browser an identity it has not got: who it is, is its session cookie.
    expect(proxyOf(serve, 'preview', route).configure).toBeUndefined()
  })
})
