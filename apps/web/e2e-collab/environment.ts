import { resolve } from 'node:path'

/**
 * Where the real stack of this suite lives. Several checkouts can run side by side, each on the ports it was given, so
 * every value comes from the environment; the defaults are the ones of a lone checkout (and of CI).
 */
const fromEnvironment = (name: string, fallback: number) => Number(process.env[name] ?? fallback)

const ports = {
  app: fromEnvironment('PLAYWRIGHT_PORT', 4173),
  api: fromEnvironment('API_PORT', 8380),
  collaboration: fromEnvironment('COLLAB_PORT', 8480),
  database: fromEnvironment('POSTGRES_PORT', 5460),
}

const database = {
  user: process.env.POSTGRES_USER ?? 'draftroom',
  password: process.env.POSTGRES_PASSWORD ?? 'draftroom',
  name: process.env.POSTGRES_DB ?? 'draftroom',
}

export const repositoryRoot = resolve(import.meta.dirname, '../../..')

export const environment = {
  ports,
  database,
  /** What Docker Compose calls the project that runs PostgreSQL: its `-p`, so the suite never touches another's. */
  composeProject: process.env.COMPOSE_PROJECT_NAME ?? 'draftroom',
  databaseUrl: `postgres://${database.user}:${database.password}@127.0.0.1:${ports.database}/${database.name}`,
  /** What a browser opens; `localhost`, which is also the `Origin` the collaboration server has to allow. */
  appOrigin: `http://localhost:${ports.app}`,
  /** The servers by their loopback address: outside production they listen there, and `localhost` may resolve to `::1`. */
  apiOrigin: `http://127.0.0.1:${ports.api}`,
  collaborationOrigin: `http://127.0.0.1:${ports.collaboration}`,
  /** Written by the server process of the suite, and kept by CI when a test fails. */
  serverLog: resolve(import.meta.dirname, '../test-results/collab-server.log'),
}
