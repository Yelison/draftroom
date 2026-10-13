/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which implementation of the data source the build contains. `vite.config.ts` always sets it. */
  readonly VITE_DATA_SOURCE: 'http' | 'mock'
  /** Where the API lives, for the `http` data source; the app's own origin when it is not set. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
