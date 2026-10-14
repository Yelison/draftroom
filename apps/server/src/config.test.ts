import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig, loadDatabaseUrl } from './config.ts'

const database = 'postgres://draftroom:draftroom@127.0.0.1:5460/draftroom'
const secret = 'a-secret-of-at-least-thirty-two-characters'

function problemsOf(environment: NodeJS.ProcessEnv): readonly string[] {
  try {
    loadConfig(environment)
  } catch (error) {
    if (error instanceof ConfigError) return error.problems
    throw error
  }
  return []
}

describe('loadConfig', () => {
  it('reads a development environment with only the database and fills in the rest', () => {
    const config = loadConfig({ DATABASE_URL: database })

    expect(config).toMatchObject({
      nodeEnv: 'development',
      apiPort: 8380,
      collabPort: 8480,
      apiHost: '127.0.0.1',
      databaseUrl: database,
      allowedOrigins: [],
    })
  })

  it('generates a different secret for each development process instead of shipping one in the sources', () => {
    const first = loadConfig({ DATABASE_URL: database }).sessionSecret
    const second = loadConfig({ DATABASE_URL: database }).sessionSecret

    expect(first).toHaveLength(64)
    expect(first).not.toBe(second)
  })

  it('reads ports, secret and origins, and listens on every interface in production', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: database,
      SESSION_SECRET: secret,
      API_PORT: '9000',
      COLLAB_PORT: '9001',
      ALLOWED_ORIGINS: 'https://draftroom.example, https://www.draftroom.example',
    })

    expect(config).toMatchObject({
      nodeEnv: 'production',
      apiPort: 9000,
      collabPort: 9001,
      apiHost: '0.0.0.0',
      sessionSecret: secret,
      allowedOrigins: ['https://draftroom.example', 'https://www.draftroom.example'],
    })
  })

  it('treats a variable set to an empty string as absent', () => {
    expect(loadConfig({ DATABASE_URL: database, API_PORT: '', ALLOWED_ORIGINS: '' }).apiPort).toBe(8380)
  })

  describe('refuses to start', () => {
    const invalid: readonly (readonly [string, NodeJS.ProcessEnv, string])[] = [
      ['without a database', {}, 'DATABASE_URL'],
      ['with a database that is not postgres', { DATABASE_URL: 'mysql://localhost/db' }, 'DATABASE_URL'],
      ['with an unknown environment', { DATABASE_URL: database, NODE_ENV: 'staging' }, 'NODE_ENV'],
      ['with a port that is not a number', { DATABASE_URL: database, API_PORT: 'eighty' }, 'API_PORT'],
      ['with a port out of range', { DATABASE_URL: database, COLLAB_PORT: '70000' }, 'COLLAB_PORT'],
      ['with a short secret', { DATABASE_URL: database, SESSION_SECRET: 'short' }, 'SESSION_SECRET'],
      [
        'with an origin that carries a path',
        { DATABASE_URL: database, ALLOWED_ORIGINS: 'https://draftroom.example/app' },
        'ALLOWED_ORIGINS',
      ],
      ['with a wildcard origin', { DATABASE_URL: database, ALLOWED_ORIGINS: '*' }, 'ALLOWED_ORIGINS'],
      [
        'with the collaboration port on the default API port',
        { DATABASE_URL: database, COLLAB_PORT: '8380' },
        'API_PORT and COLLAB_PORT',
      ],
      [
        'with both servers on one port',
        { DATABASE_URL: database, API_PORT: '9000', COLLAB_PORT: '9000' },
        'API_PORT and COLLAB_PORT',
      ],
      [
        'in production without a secret',
        { DATABASE_URL: database, NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://draftroom.example' },
        'SESSION_SECRET: is required',
      ],
      [
        'in production without origins',
        { DATABASE_URL: database, NODE_ENV: 'production', SESSION_SECRET: secret },
        'ALLOWED_ORIGINS: is required',
      ],
    ]

    it.each(invalid)('%s', (_name, environment, expected) => {
      expect(problemsOf(environment).join('\n')).toContain(expected)
    })

    it('names every problem at once, the rules of one variable and the rules that tie several together', () => {
      expect(problemsOf({ NODE_ENV: 'production', DATABASE_URL: 'mysql://localhost/db', API_PORT: 'abc' })).toEqual([
        'API_PORT: Invalid input: expected number, received NaN',
        'DATABASE_URL: must be a postgres:// connection string',
        'SESSION_SECRET: is required when NODE_ENV is production',
        'ALLOWED_ORIGINS: is required when NODE_ENV is production',
      ])
    })

    it('says a variable that is missing is required, instead of describing the type it lacks', () => {
      expect(problemsOf({})).toEqual(['DATABASE_URL: is required'])
    })
  })

  it('does not require a secret in test', () => {
    expect(problemsOf({ DATABASE_URL: database, NODE_ENV: 'test' })).toEqual([])
  })

  it('ignores the rest of the environment', () => {
    expect(problemsOf({ DATABASE_URL: database, PATH: '/usr/bin', HOME: '/root' })).toEqual([])
  })
})

describe('loadDatabaseUrl', () => {
  it('needs only the database, not the session secret a production server needs', () => {
    expect(loadDatabaseUrl({ DATABASE_URL: database, NODE_ENV: 'production' })).toBe(database)
  })

  it('refuses to run without a database', () => {
    expect(() => loadDatabaseUrl({})).toThrow(ConfigError)
  })
})
