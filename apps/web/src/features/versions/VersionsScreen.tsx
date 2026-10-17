import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { Button, buttonClassName } from '@yelison/forma-ui'
import { useState } from 'react'
import { useIntl } from 'react-intl'
import { Link, useParams } from 'react-router'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { isApiError } from '../../data/errors.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { StateMessage } from '../documents/StateMessage.tsx'
import { documentQuery } from '../editor/documentQuery.ts'
import { canEdit } from '../editor/roles.ts'
import { RestoreDialog } from './RestoreDialog.tsx'
import { SaveVersionDialog } from './SaveVersionDialog.tsx'
import { VersionList } from './VersionList.tsx'
import { VersionPreview } from './VersionPreview.tsx'
import { VersionsPlaceholder } from './VersionsSkeleton.tsx'
import { useVersionName } from './useVersionName.ts'
import styles from './Versions.module.css'

/**
 * The screen of `/documents/:documentId/versions`: the versions of a document, the one that is open beside them, and
 * for those who may, saving a version and (owners) going back to one. It opens no connection to the document: the
 * people in it are not told that someone is looking at an old version, and what is shown is never the live text.
 *
 * The headline is one element in every state, so the focus that navigation puts on it stays on it when the document
 * arrives.
 */
export function VersionsScreen() {
  const intl = useIntl()
  const { documentId } = useParams()
  if (documentId === undefined) throw new Error('The route of the versions has no :documentId')
  const dataSource = useDataSource()
  const query = useQuery(documentQuery(dataSource, documentId))
  const document = query.data
  const nameOf = useVersionName()
  const [selected, setSelected] = useState<Schema<'Version'> | null>(null)
  const [restoring, setRestoring] = useState<Schema<'Version'> | null>(null)
  const [saving, setSaving] = useState(false)
  // Counted, so that the same message twice in a row is a new element and is announced again.
  const [announcement, setAnnouncement] = useState({ count: 0, text: '' })
  const announce = (text: string) => setAnnouncement(({ count }) => ({ count: count + 1, text }))

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <PageTitle titleId="screen.versions" />
        {document !== undefined && (
          <div className={styles.actions}>
            <Link to={`/documents/${document.id}`} className={buttonClassName({ variant: 'secondary' })}>
              {intl.formatMessage({ id: 'versions.back' }, { title: document.title })}
            </Link>
            {canEdit(document.role) && (
              <Button onClick={() => setSaving(true)}>{intl.formatMessage({ id: 'versions.save.button' })}</Button>
            )}
          </div>
        )}
      </header>
      {query.isPending && <VersionsPlaceholder />}
      {query.isError && (
        <DocumentProblem
          notFound={isApiError(query.error, 'not-found')}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      )}
      {document !== undefined && (
        <>
          <div className={styles.body}>
            <section aria-label={intl.formatMessage({ id: 'versions.list.label' })}>
              <VersionList
                documentId={document.id}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
                onRestore={document.role === 'owner' ? setRestoring : undefined}
              />
            </section>
            <VersionPreview documentId={document.id} version={selected} />
          </div>
          <SaveVersionDialog
            document={document}
            open={saving}
            onClose={() => setSaving(false)}
            onSaved={() => {
              setSaving(false)
              announce(intl.formatMessage({ id: 'versions.save.announcement' }))
            }}
          />
          <RestoreDialog
            document={document}
            version={restoring}
            onClose={() => setRestoring(null)}
            onRestored={(version) => {
              setRestoring(null)
              announce(intl.formatMessage({ id: 'versions.restore.announcement' }, { name: nameOf(version) }))
            }}
          />
        </>
      )}
      <p role="status" className="forma-visually-hidden">
        {announcement.text !== '' && <span key={announcement.count}>{announcement.text}</span>}
      </p>
    </div>
  )
}

/** The reason there is no history to show: the document is not there for this person, or it could not be asked for. */
function DocumentProblem({
  notFound,
  retrying,
  onRetry,
}: {
  notFound: boolean
  retrying: boolean
  onRetry: () => void
}) {
  const intl = useIntl()
  return (
    <StateMessage
      role="alert"
      title={intl.formatMessage({ id: notFound ? 'editor.state.notFound.title' : 'editor.state.error.title' })}
      description={intl.formatMessage({
        id: notFound ? 'editor.state.notFound.description' : 'editor.state.error.description',
      })}
    >
      {notFound ? (
        <Link to="/documents" className={buttonClassName()}>
          {intl.formatMessage({ id: 'editor.state.notFound.action' })}
        </Link>
      ) : (
        <Button loading={retrying} onClick={onRetry}>
          {intl.formatMessage({ id: 'editor.state.error.retry' })}
        </Button>
      )}
    </StateMessage>
  )
}
