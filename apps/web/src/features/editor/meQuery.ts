import { queryOptions } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { queryKeys } from '../../data/queryKeys.ts'

/** Who is signed in: the editor needs their id to say who is writing, and the server decides the name others see. */
export const meQuery = (dataSource: DataSource) =>
  queryOptions({ queryKey: queryKeys.me(), queryFn: () => dataSource.getMe(), staleTime: Infinity })
