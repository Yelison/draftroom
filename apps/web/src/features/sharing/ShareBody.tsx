import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { isApiError } from '../../data/errors.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { meQuery } from '../editor/meQuery.ts'
import { StateMessage } from '../documents/StateMessage.tsx'
import { AccessEditor } from './AccessEditor.tsx'
import { accessQuery, membersQuery } from './queries.ts'
import { ShareSkeleton } from './ShareSkeleton.tsx'

/**
 * What the share dialog holds: the editor of who has access, or the reason there is none. Only an owner can read or
 * change the access of a document, so anyone else is told so without a request; and a refusal from the server, which has
 * the last word (the role may have changed since the screen last heard of it), is the same message.
 */
export function ShareBody({ document }: { document: Schema<'Document'> }) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const owner = document.role === 'owner'
  const access = useQuery(accessQuery(dataSource, document.id, owner))
  const members = useQuery(membersQuery(dataSource, document.workspaceId, owner))
  const me = useQuery(meQuery(dataSource))

  const refused = access.isError && isApiError(access.error, 'forbidden')
  if (!owner || refused) {
    return (
      <StateMessage
        title={intl.formatMessage({ id: 'sharing.forbidden.title' })}
        description={intl.formatMessage({ id: 'sharing.forbidden.description' })}
      />
    )
  }
  if (access.isError || members.isError) {
    return (
      <StateMessage
        role="alert"
        title={intl.formatMessage({ id: 'sharing.error.title' })}
        description={intl.formatMessage({ id: 'sharing.error.description' })}
      >
        <Button
          loading={access.isFetching || members.isFetching}
          onClick={() => {
            void access.refetch()
            void members.refetch()
          }}
        >
          {intl.formatMessage({ id: 'sharing.error.retry' })}
        </Button>
      </StateMessage>
    )
  }
  if (access.data === undefined || members.data === undefined) return <ShareSkeleton />
  return <AccessEditor document={document} access={access.data} members={members.data.items} meId={me.data?.id} />
}
