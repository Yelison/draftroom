import { FormaProvider, type FormaStrings } from '@yelison/forma-ui'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { isApiError } from '../data/errors.ts'
import { queryKeys } from '../data/queryKeys.ts'
import { LocaleProvider } from '../i18n/LocaleProvider.tsx'

export interface AppProvidersProps {
  children: ReactNode
}

/**
 * A session can end while the app is open (it expired, or the person signed out in another tab). The server then answers
 * `401` to whatever the page asks next, and that is the moment to ask who the session is again: the gate sees that nobody
 * is, and sends the person to sign in, from the page they were on. The question about the session itself is left out,
 * or its own refusal would ask it again for ever.
 */
function createQueryClient(): QueryClient {
  const endedSession = (error: Error, key: readonly unknown[] | undefined) => {
    if (isApiError(error, 'unauthenticated') && key?.[0] !== queryKeys.me()[0]) {
      void client.invalidateQueries({ queryKey: queryKeys.me() })
    }
  }
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => endedSession(error, query.queryKey) }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => endedSession(error, mutation.options.mutationKey),
    }),
  })
  return client
}

/** Everything the screens read from above: the language, Forma UI's text in that language, and server state. */
export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(createQueryClient)

  return (
    <LocaleProvider>
      <TranslatedFormaProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </TranslatedFormaProvider>
    </LocaleProvider>
  )
}

/** The two strings Forma UI's components show on their own, in the language of the app. */
function TranslatedFormaProvider({ children }: { children: ReactNode }) {
  const intl = useIntl()
  const strings = useMemo<FormaStrings>(
    () => ({
      buttonLoading: intl.formatMessage({ id: 'forma.buttonLoading' }),
      dialogClose: intl.formatMessage({ id: 'forma.dialogClose' }),
    }),
    [intl],
  )

  return <FormaProvider strings={strings}>{children}</FormaProvider>
}
