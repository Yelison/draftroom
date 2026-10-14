import { useQuery } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { workspacesQuery } from './queries.ts'

/**
 * The workspace a screen works in: the first of the person's workspaces, which the contract orders by name. Every list,
 * folder and mutation is scoped to it. There is one workspace per person until the product has a way to choose; when it
 * has, this is the one place that changes.
 */
export function useWorkspaceId() {
  const dataSource = useDataSource()
  return useQuery({ ...workspacesQuery(dataSource), select: (page) => page.items[0]?.id })
}
