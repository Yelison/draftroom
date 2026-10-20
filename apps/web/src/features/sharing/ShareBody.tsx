import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { isApiError } from '../../data/errors.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { meQuery } from '../editor/meQuery.ts'
import { StateMessage } from '../documents/StateMessage.tsx'
import { AccessEditor } from './AccessEditor.tsx'
import { membersQuery } from '../documents/queries.ts'
import { workspaceQuery } from '../settings/queries.ts'
import { accessQuery } from './queries.ts'
import { ShareSkeleton } from './ShareSkeleton.tsx'

/**
 * What the share dialog holds: the editor of who has access, or the reason there is none. Only an owner can read or
 * change the access of a document, so anyone else is told so without a request; and a refusal from the server, which has
 * the last word (the role may have changed since the screen last heard of it), is the same message.
 */
export function ShareBody({
  document,
  announce,
}: {
  document: Schema<'Document'>
  /** Says something in the live region of the dialog. */
  announce: (text: string) => void
}) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const owner = document.role === 'owner'
  const access = useQuery(accessQuery(dataSource, document.id, owner))
  // The members of the workspace, read the way the history reads them (the same key and the same list), and only for an
  // owner: nobody else has anything to share.
  const members = useQuery({ ...membersQuery(dataSource, document.workspaceId), enabled: owner })
  // Its name is what the last row of the list calls the whole workspace, so it is read before the rows are shown.
  const workspace = useQuery({ ...workspaceQuery(dataSource, document.workspaceId), enabled: owner })
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
  if (access.isError || members.isError || workspace.isError) {
    return (
      <StateMessage
        role="alert"
        title={intl.formatMessage({ id: 'sharing.error.title' })}
        description={intl.formatMessage({ id: 'sharing.error.description' })}
      >
        <Button
          loading={access.isFetching || members.isFetching || workspace.isFetching}
          onClick={() => {
            void access.refetch()
            void members.refetch()
            void workspace.refetch()
          }}
        >
          {intl.formatMessage({ id: 'sharing.error.retry' })}
        </Button>
      </StateMessage>
    )
  }
  if (access.data === undefined || members.data === undefined || workspace.data === undefined) {
    return <ShareSkeleton />
  }
  return (
    <AccessEditor
      document={document}
      access={access.data}
      announce={announce}
      members={members.data.items}
      workspaceName={workspace.data.name}
      meId={me.data?.id}
    />
  )
}
