import { defineConfig, devices } from '@playwright/test'

// Several checkouts run side by side, each on the ports it was given; without the variable Playwright's own default.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: '.',
  ...(isCI ? {} : { workers: 2 }),
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report/demo' }]] : 'list',
  // Under the names the repository already ignores.
  outputDir: 'test-results/demo',
  use: {
    // The trailing slash matters: a path given to `goto` is resolved against it, so it has to be relative.
    baseURL: `http://localhost:${port}/draftroom/`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The demo is built here, so the suite always tests what `build:demo` makes. A server that was already running is
    // never reused: it could be serving an older build.
    command: 'npm run build:demo && node e2e-demo/server.ts',
    // Playwright runs it from the directory of this file; the scripts are those of the package.
    cwd: '..',
    url: `http://localhost:${port}/draftroom/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
