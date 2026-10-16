import { queryOptions, useQuery } from '@tanstack/react-query'
import type { DataSource } from '../../data/DataSource.ts'
import { queryKeys } from '../../data/queryKeys.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { retryTransportOnce } from '../documents/queries.ts'
import type { Locale } from '../../i18n/locale.ts'
import { useLocale } from '../../i18n/useLocale.ts'

/** The built-in templates, named in `locale`. They are product content: they never change while the app is open. */
export const templatesQuery = (dataSource: DataSource, locale: Locale) =>
  queryOptions({
    queryKey: queryKeys.templates(locale),
    queryFn: () => dataSource.listTemplates({ params: { query: { locale } } }),
    retry: retryTransportOnce,
    staleTime: Infinity,
  })

/** The templates in the language of the app: a document made from one is written in the same language. */
export function useTemplates() {
  const { locale } = useLocale()
  const query = useQuery(templatesQuery(useDataSource(), locale))
  return { query, locale }
}
