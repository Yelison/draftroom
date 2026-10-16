import { useState } from 'react'
import { useIntl } from 'react-intl'
import { focusMainContent } from '../../app/mainContent.ts'
import { DocumentActionDialogs } from '../documents/actions/DocumentActionDialogs.tsx'
import { useActionDialogs } from '../documents/actions/useActionDialogs.ts'
import { DocumentCollection } from '../documents/DocumentCollection.tsx'
import { DocumentsSkeleton } from '../documents/ListSkeleton.tsx'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'

/** The documents that match a search, in the workspace of the person, with the actions every list of documents has. */
export function SearchResults({ term }: { term: string }) {
  return (
    <WorkspaceGate loading={<DocumentsSkeleton />}>
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
      {/* There is a term, so the list never has the empty state of a list nobody searched: it says "no results" itself. */}
      <DocumentCollection
        workspaceId={workspaceId}
        term={term}
        empty={null}
        onActions={(document) => actions.open({ kind: 'details', document })}
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
