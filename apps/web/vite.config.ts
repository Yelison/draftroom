/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import { contentSecurityPolicyMeta } from './scripts/content-security-policy.ts'
import { firstPaintScripts } from './scripts/first-paint.ts'
import { headScripts } from './scripts/head-scripts.ts'
import { messagesAst } from './scripts/messages-ast.ts'

// Several checkouts can run side by side: each one takes its own ports from the environment. A port that is set is
// strict, because a busy one is an error, not a reason to move to another that could belong to another checkout.
// Without the variables Vite keeps its own defaults.
const strictPort = (variable: string) =>
  process.env[variable] ? { port: Number(process.env[variable]), strictPort: true } : {}

const pseudoDirectory = '__pseudo__'

// The data source is chosen when the app is built: the real API in a production build, the in-memory mock in every other
// mode (development, the mocked end-to-end suite, tests, the pseudo-locale build). `VITE_DATA_SOURCE` overrides it, so
// `vite build --mode production` with `VITE_DATA_SOURCE=mock` makes a build for a static demo.
const dataSourceFor = (mode: string, variables: Record<string, string>): 'http' | 'mock' => {
  const chosen = variables.VITE_DATA_SOURCE ?? (mode === 'production' ? 'http' : 'mock')
  if (chosen !== 'http' && chosen !== 'mock')
    throw new Error(`VITE_DATA_SOURCE is "${chosen}": it must be http or mock`)
  return chosen
}

// The end-to-end suite against the real server (`playwright.collab.config.ts`) serves `/api` and `/collab` from the origin of
// the app, through this proxy, as a reverse proxy does in production (plan section 3.3). The browser then sends its session
// cookie to the API as it will in production, and needs no CORS, which the server does not have until T7.2. The proxy
// forwards what the browser sends and rewrites nothing: who the browser is, is the session cookie it holds, which the server
// resolves (docs/decisions/0004-authentication.md). It exists only when both targets are named in the environment, and only
// for the servers of development and preview: it is never part of a build.
const realStackProxy = (variables: NodeJS.ProcessEnv): { proxy?: Record<string, ProxyOptions> } => {
  const api = variables.E2E_API_ORIGIN
  const collaboration = variables.E2E_COLLAB_ORIGIN
  if (!api || !collaboration) return {}
  return { proxy: { '/api': { target: api }, '/collab': { target: collaboration, ws: true } } }
}

export default defineConfig(({ command, mode }) => ({
  // The pseudo-locale build is served by the same preview as the real one, from a directory of its own inside dist/.
  base: mode === 'pseudo' ? `/${pseudoDirectory}/` : '/',
  build: {
    outDir: mode === 'pseudo' ? `dist/${pseudoDirectory}` : 'dist',
  },
  resolve: {
    // The production build ships the messages as syntax trees (scripts/messages-ast.ts), so react-intl never parses an
    // ICU message and the parser is left out of the bundle: this entry has `parse` throw instead. Tests and the dev
    // server pass plain strings, which need the real parser.
    alias:
      command === 'build'
        ? [
            {
              find: /^@formatjs\/icu-messageformat-parser$/,
              replacement: '@formatjs/icu-messageformat-parser/no-parser.js',
            },
          ]
        : [],
  },
  // Written as a literal, so that code which compares it is folded away by the bundler and the unused data source is
  // never part of the bundle.
  define: {
    'import.meta.env.VITE_DATA_SOURCE': JSON.stringify(
      dataSourceFor(mode, loadEnv(mode, import.meta.dirname, 'VITE_')),
    ),
  },
  plugins: [
    react(),
    firstPaintScripts(headScripts),
    contentSecurityPolicyMeta(),
    messagesAst({
      directory: resolve(import.meta.dirname, 'src/i18n'),
      // `npm run build:pseudo` builds the app with accented, longer text in place of the messages, to check that no
      // layout depends on the length of English. It is never what is deployed.
      pseudoLocale: mode === 'pseudo' ? 'en-XA' : undefined,
    }),
  ],
  server: { ...strictPort('DEV_SERVER_PORT'), ...(command === 'serve' ? realStackProxy(process.env) : {}) },
  preview: { ...strictPort('PLAYWRIGHT_PORT'), ...(command === 'serve' ? realStackProxy(process.env) : {}) },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
}))
