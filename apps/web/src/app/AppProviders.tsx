import { FormaProvider, type FormaStrings } from '@yelison/forma-ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { LocaleProvider } from '../i18n/LocaleProvider.tsx'

export interface AppProvidersProps {
  children: ReactNode
}

/** Everything the screens read from above: the language, Forma UI's text in that language, and server state. */
export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => new QueryClient())

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
