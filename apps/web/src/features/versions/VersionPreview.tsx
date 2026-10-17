import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { StateMessage } from '../documents/StateMessage.tsx'
import { PreviewDocument } from './PreviewDocument.tsx'
import { versionContentQuery } from './queries.ts'
import { useVersionDate, useVersionName } from './useVersionName.ts'
import styles from './Versions.module.css'

/** The panel beside the list: what the chosen version held, or what to do to see one. */
export function VersionPreview({ documentId, version }: { documentId: string; version: Schema<'Version'> | null }) {
  const intl = useIntl()
  const nameOf = useVersionName()
  const dateOf = useVersionDate()

  return (
    <section className={styles.preview} aria-labelledby="versions-preview-title">
      <h2 id="versions-preview-title" className={styles.previewTitle}>
        {version === null ? intl.formatMessage({ id: 'versions.preview.title' }) : (version.label ?? dateOf(version))}
      </h2>
      {version === null ? (
        <StateMessage
          title={intl.formatMessage({ id: 'versions.preview.none.title' })}
          description={intl.formatMessage({ id: 'versions.preview.none.description' })}
        />
      ) : (
        // Another version is another preview: nothing of the last one, loading or failed, carries over.
        <Content key={version.id} documentId={documentId} version={version} label={nameOf(version)} />
      )}
    </section>
  )
}

function Content({ documentId, version, label }: { documentId: string; version: Schema<'Version'>; label: string }) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const content = useQuery(versionContentQuery(dataSource, documentId, version.id))

  if (content.isPending) {
    return (
      <div aria-busy="true" className={styles.previewSkeleton}>
        <p role="status" className="forma-visually-hidden">
          {intl.formatMessage({ id: 'versions.preview.loading' })}
        </p>
      </div>
    )
  }
  if (content.isError) {
    return (
      <StateMessage
        role="alert"
        title={intl.formatMessage({ id: 'versions.preview.error.title' })}
        description={intl.formatMessage({ id: 'versions.preview.error.description' })}
      >
        <Button loading={content.isFetching} onClick={() => void content.refetch()}>
          {intl.formatMessage({ id: 'versions.error.retry' })}
        </Button>
      </StateMessage>
    )
  }
  return (
    <>
      <p className={styles.readOnly}>{intl.formatMessage({ id: 'versions.preview.readOnly' })}</p>
      <PreviewDocument
        update={content.data}
        label={intl.formatMessage({ id: 'versions.preview.label' }, { name: label })}
      />
    </>
  )
}
