import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

// Regenerates the pictures and the short video of the README (`docs/assets/`) from the real stack:
//
//     npm run docs:tour
//
// It starts PostgreSQL in a Compose project of its own, builds the web app in production mode (the real API, not the mock),
// starts the server on the demo seed, drives the app with Playwright and removes the database when it is done. Run it
// before every release, so that the README shows the app as it is. Needs Docker with the Compose plugin and the browser
// (`npx playwright install chromium`).
//
// Everything it touches can be moved with the environment: PLAYWRIGHT_PORT, API_PORT, COLLAB_PORT and POSTGRES_PORT for the
// ports, COMPOSE_PROJECT_NAME and POSTGRES_DB for the project and the database. TOUR_OUTPUT is the directory the files are
// written to (`docs/assets` by default).

const root = resolve(import.meta.dirname, '../..')
const project = process.env.COMPOSE_PROJECT_NAME ?? 'draftroom-readme-tour'
const environment = {
  ...process.env,
  COMPOSE_PROJECT_NAME: project,
  POSTGRES_DB: process.env.POSTGRES_DB ?? 'draftroom_readme_tour',
  POSTGRES_PORT: process.env.POSTGRES_PORT ?? '5470',
  PLAYWRIGHT_PORT: process.env.PLAYWRIGHT_PORT ?? '4370',
  API_PORT: process.env.API_PORT ?? '8390',
  COLLAB_PORT: process.env.COLLAB_PORT ?? '8490',
}

const compose = (...args: string[]) =>
  spawnSync('docker', ['compose', '-p', project, ...args], { cwd: root, env: environment, stdio: 'inherit' })

let status = 1
try {
  if (compose('up', '-d', '--wait', 'postgres').status !== 0) throw new Error('PostgreSQL did not start')
  status = await new Promise<number>((done) => {
    const playwright = spawn(
      'npx',
      ['playwright', 'test', '--config', 'scripts/readme-tour/playwright.config.ts', '--workers=1'],
      { cwd: root, env: environment, stdio: 'inherit' },
    )
    playwright.once('exit', (code) => done(code ?? 1))
  })
} finally {
  // `-v` takes the volume with it: the next run starts from a database that only the seed has touched.
  compose('down', '-v')
}
process.exit(status)
