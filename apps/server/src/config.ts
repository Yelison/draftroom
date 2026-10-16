import { randomBytes } from 'node:crypto'
import { z } from 'zod'

const nodeEnvironments = ['development', 'test', 'production'] as const
export type NodeEnvironment = (typeof nodeEnvironments)[number]

const port = z.coerce.number().int().min(1).max(65535)
const defaultPorts = { api: 8380, collab: 8480 } as const

const splitList = (list: string): string[] =>
  list
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')

// A browser sends the origin without a path, so anything else in the list could never match and is a typo.
const origin = z.string().refine((value) => URL.canParse(value) && new URL(value).origin === value, {
  message: 'must be an origin such as https://app.example, without a path or a trailing slash',
})

const databaseUrl = z
  .string({ error: 'is required' })
  .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string')

const environmentSchema = z.object({
  NODE_ENV: z.enum(nodeEnvironments).default('development'),
  API_PORT: port.default(defaultPorts.api),
  COLLAB_PORT: port.default(defaultPorts.collab),
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: z.string().min(32, 'must have at least 32 characters').optional(),
  ALLOWED_ORIGINS: z.string().default('').transform(splitList).pipe(z.array(origin)),
})

export interface Config {
  readonly nodeEnv: NodeEnvironment
  /**
   * Whether the development identity (`X-Dev-User`) may serve. Only when `NODE_ENV` was set, to `development` or `test`:
   * a missing or empty variable still means `development` for everything else here, but must never open a door that lets
   * anyone act as anyone, because forgetting the variable is the likeliest mistake in a deployment.
   */
  readonly devIdentity: boolean
  readonly apiPort: number
  /** Reserved for the collaboration server (phase 2); validated now so a clash is found at start-up. */
  readonly collabPort: number
  readonly apiHost: string
  readonly databaseUrl: string
  readonly sessionSecret: string
  readonly allowedOrigins: readonly string[]
}

export class ConfigError extends Error {
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
    this.name = 'ConfigError'
    this.problems = problems
  }
}

type Picked = Readonly<Record<string, string>>

/** Only the variables named are read, and an empty value counts as absent: it is a variable set to nothing. */
function pick(environment: NodeJS.ProcessEnv, names: readonly string[]): Picked {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = environment[name]
      return value === undefined || value === '' ? [] : [[name, value]]
    }),
  )
}

const describeIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)

/**
 * The rules that tie variables together. They read the raw values, not the parsed ones: a variable that fails its own
 * rule stops the schema from producing a result, and the rules that depend on others must still be reported with it.
 */
function inconsistencies(picked: Picked): string[] {
  const production = picked['NODE_ENV'] === 'production'
  const apiPort = Number(picked['API_PORT'] ?? defaultPorts.api)
  const collabPort = Number(picked['COLLAB_PORT'] ?? defaultPorts.collab)
  return [
    ...(apiPort === collabPort ? ['API_PORT and COLLAB_PORT must be different ports'] : []),
    ...(production && picked['SESSION_SECRET'] === undefined
      ? ['SESSION_SECRET: is required when NODE_ENV is production']
      : []),
    ...(production && splitList(picked['ALLOWED_ORIGINS'] ?? '').length === 0
      ? ['ALLOWED_ORIGINS: is required when NODE_ENV is production']
      : []),
  ]
}

/**
 * Reads the configuration from the environment and refuses to start on anything missing or wrong, naming every problem
 * at once. Only the variables below are read: the rest of the environment is not ours to judge.
 */
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const picked = pick(environment, Object.keys(environmentSchema.shape))
  const parsed = environmentSchema.safeParse(picked)
  const problems = [...(parsed.success ? [] : describeIssues(parsed.error)), ...inconsistencies(picked)]
  if (!parsed.success || problems.length > 0) throw new ConfigError(problems)
  const env = parsed.data

  return {
    nodeEnv: env.NODE_ENV,
    devIdentity: picked['NODE_ENV'] === 'development' || picked['NODE_ENV'] === 'test',
    apiPort: env.API_PORT,
    collabPort: env.COLLAB_PORT,
    // Loopback while developing, so a laptop does not serve a development database to its network; a container
    // in production has to listen on all interfaces behind its reverse proxy.
    apiHost: env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
    databaseUrl: env.DATABASE_URL,
    // No secret literal in the sources: outside production a missing secret is a random one for this process.
    sessionSecret: env.SESSION_SECRET ?? randomBytes(32).toString('hex'),
    allowedOrigins: env.ALLOWED_ORIGINS,
  }
}

/** What the migration command needs: a deployment step that migrates has no use for a session secret. */
export function loadDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const parsed = z.object({ DATABASE_URL: databaseUrl }).safeParse(pick(environment, ['DATABASE_URL']))
  if (!parsed.success) throw new ConfigError(describeIssues(parsed.error))
  return parsed.data.DATABASE_URL
}
