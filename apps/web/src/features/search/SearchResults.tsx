import { useState } from 'react'
import { useIntl } from 'react-intl'
import { focusMainContent } from '../../app/mainContent.ts'
import { DocumentActionDialogs } from '../documents/actions/DocumentActionDialogs.tsx'
import { useActionDialogs } from '../documents/actions/useActionDialogs.ts'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import { ResultList, ResultsLoading } from './ResultList.tsx'

/** The documents that match a search, in the workspace of the person, with the actions every list of documents has. */
export function SearchResults({ term }: { term: string }) {
  return (
    <WorkspaceGate loading={<ResultsLoading />}>
      {(workspaceId) => <Results workspaceId={workspaceId} term={term} />}
    </WorkspaceGate>
  )
}

function Results({ workspaceId, term }: { workspaceId: string; term: string }) {
  const intl = useIntl()
  const actions = useActionDialogs(focusMainContent)
  const [announcement, setAnnouncement] = useState('')

  return (
    <>
      <ResultList
        workspaceId={workspaceId}
        term={term}
        onActions={(document) => actions.open({ kind: 'details', document })}
        onArchive={(document) => actions.open({ kind: 'archive', document })}
      />
      <DocumentActionDialogs
        actions={actions}
        onArchived={(document) =>
          setAnnouncement(intl.formatMessage({ id: 'documents.archive.announcement' }, { title: document.title }))
        }
      />
      <p role="status" className="forma-visually-hidden">
        {announcement}
      </p>
    </>
  )
}
