import { createContext } from 'react'
import type { DataSource } from './DataSource.ts'

export const DataSourceContext = createContext<DataSource | null>(null)
