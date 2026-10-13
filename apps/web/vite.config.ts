/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
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
    messagesAst({
      directory: resolve(import.meta.dirname, 'src/i18n'),
      // `npm run build:pseudo` builds the app with accented, longer text in place of the messages, to check that no
      // layout depends on the length of English. It is never what is deployed.
      pseudoLocale: mode === 'pseudo' ? 'en-XA' : undefined,
    }),
  ],
  server: strictPort('DEV_SERVER_PORT'),
  preview: strictPort('PLAYWRIGHT_PORT'),
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
}))
