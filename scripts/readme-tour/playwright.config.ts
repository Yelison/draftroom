import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { environment, repositoryRoot } from '../../apps/web/e2e-collab/environment.ts'

// The pictures and the video of the README, taken from the real stack. Run it with `npm run docs:tour` (run.ts), which
// also starts PostgreSQL and takes it away again. The web app is built in production mode, with the real API, in a directory
// of its own, and served by `vite preview`, which also proxies `/api` and `/collab` as the reverse proxy does in production.
export default defineConfig({
  testDir: '.',
  testMatch: 'tour.spec.ts',
  outputDir: resolve(repositoryRoot, 'apps/web/test-results/readme-tour'),
  globalSetup: './globalSetup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  reporter: 'list',
  use: { baseURL: environment.appOrigin },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'npx vite build --mode production --outDir dist/readme-tour --emptyOutDir && npx vite preview --outDir dist/readme-tour',
    cwd: resolve(repositoryRoot, 'apps/web'),
    env: {
      PLAYWRIGHT_PORT: String(environment.ports.app),
      E2E_API_ORIGIN: environment.apiOrigin,
      E2E_COLLAB_ORIGIN: environment.collaborationOrigin,
    },
    url: environment.appOrigin,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
