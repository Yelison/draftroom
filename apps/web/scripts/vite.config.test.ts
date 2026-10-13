import type { ConfigEnv, UserConfig, UserConfigFnObject } from 'vite'
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
