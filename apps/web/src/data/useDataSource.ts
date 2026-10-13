import { use } from 'react'
import type { DataSource } from './DataSource.ts'
import { DataSourceContext } from './DataSourceContext.ts'

/** The data source the app was built with: every screen reads and writes through it, never through `fetch`. */
export function useDataSource(): DataSource {
  const dataSource = use(DataSourceContext)
  if (dataSource === null) throw new Error('useDataSource needs a DataSourceContext above it')
  return dataSource
}
