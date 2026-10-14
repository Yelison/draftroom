import { randomBytes } from 'node:crypto'
import { z } from 'zod'

const nodeEnvironments = ['development', 'test', 'production'] as const
export type NodeEnvironment = (typeof nodeEnvironments)[number]

const port = z.coerce.number().int().min(1).max(65535)

// A browser sends the origin without a path, so anything else in the list could never match and is a typo.
const origin = z.string().refine((value) => URL.canParse(value) && new URL(value).origin === value, {
  message: 'must be an origin such as https://app.example, without a path or a trailing slash',
})

const databaseUrl = z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string')

const environmentSchema = z.object({
  NODE_ENV: z.enum(nodeEnvironments).default('development'),
  API_PORT: port.default(8380),
  COLLAB_PORT: port.default(8480),
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: z.string().min(32, 'must have at least 32 characters').optional(),
  ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((list) =>
      list
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ''),
    )
    .pipe(z.array(origin)),
})

export interface Config {
  readonly nodeEnv: NodeEnvironment
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

/** Only the keys the schema names are read, and an empty value counts as absent: it is a variable set to nothing. */
function parse<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  environment: NodeJS.ProcessEnv,
): z.output<z.ZodObject<Shape>> {
  const picked = Object.fromEntries(
    Object.keys(schema.shape).flatMap((key) => {
      const value = environment[key]
      return value === undefined || value === '' ? [] : [[key, value]]
    }),
  )
  const parsed = schema.safeParse(picked)
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`))
  }
  return parsed.data
}

/**
 * Reads the configuration from the environment and refuses to start on anything missing or wrong, naming every problem
 * at once. Only the variables below are read: the rest of the environment is not ours to judge.
 */
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const env = parse(environmentSchema, environment)

  const inconsistencies = [
    ...(env.API_PORT === env.COLLAB_PORT ? ['API_PORT and COLLAB_PORT must be different ports'] : []),
    ...(env.NODE_ENV === 'production' && env.SESSION_SECRET === undefined
      ? ['SESSION_SECRET: is required when NODE_ENV is production']
      : []),
    ...(env.NODE_ENV === 'production' && env.ALLOWED_ORIGINS.length === 0
      ? ['ALLOWED_ORIGINS: is required when NODE_ENV is production']
      : []),
  ]
  if (inconsistencies.length > 0) throw new ConfigError(inconsistencies)

  return {
    nodeEnv: env.NODE_ENV,
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
  return parse(z.object({ DATABASE_URL: databaseUrl }), environment).DATABASE_URL
}
