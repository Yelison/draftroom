import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button } from '@yelison/forma-ui'
import { useMemo } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { StateMessage } from '../documents/StateMessage.tsx'
import { ReaderPanel } from './ReaderPanel.tsx'
import { PreviewDocument } from './PreviewDocument.tsx'
import { versionContentQuery } from './queries.ts'
import { documentOf } from './versionDocument.ts'
import { useVersionDate, useVersionName } from './useVersionName.ts'
import styles from './VersionReader.module.css'

export interface VersionReaderProps {
  documentId: string
  /** The version to read, or `null` when there is none to choose yet. */
  version: Schema<'Version'> | null
  /** Why there is none to read: the versions that exist are all automatic, and hidden. */
  onlyAutomatic?: boolean
  /** Given only to owners: the server refuses anyone else, and a button that can only fail is not offered. */
  onRestore?: ((version: Schema<'Version'>) => void) | undefined
}

/**
 * What the chosen version held, with a bar above it that says which version it is and that reading it changes nothing.
 * Restoring is offered from here, once the text has been read, and not from the list.
 */
export function VersionReader({ documentId, version, onlyAutomatic = false, onRestore }: VersionReaderProps) {
  const intl = useIntl()
  return (
    <ReaderPanel>
      {version === null ? (
        <StateMessage
          title={intl.formatMessage({ id: onlyAutomatic ? 'versions.reader.hidden' : 'versions.reader.empty' })}
        />
      ) : (
        // Another version is another reading: nothing of the last one, loading or failed, carries over.
        <Reading key={version.id} documentId={documentId} version={version} onRestore={onRestore} />
      )}
    </ReaderPanel>
  )
}

function Reading({
  documentId,
  version,
  onRestore,
}: {
  documentId: string
  version: Schema<'Version'>
  onRestore: VersionReaderProps['onRestore']
}) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const content = useQuery(versionContentQuery(dataSource, documentId, version.id))

  if (content.isPending) {
    return (
      <>
        <ReaderBar version={version} offersRestore={onRestore !== undefined} />
        <div aria-busy="true" className={styles.skeleton}>
          <p role="status" className="forma-visually-hidden">
            {intl.formatMessage({ id: 'versions.reader.loading' })}
          </p>
        </div>
      </>
    )
  }
  if (content.isError) {
    return (
      <>
        <ReaderBar version={version} offersRestore={onRestore !== undefined} />
        <StateMessage
          role="alert"
          title={intl.formatMessage({ id: 'versions.reader.error.title' })}
          description={intl.formatMessage({ id: 'versions.reader.error.description' })}
        >
          <Button loading={content.isFetching} onClick={() => void content.refetch()}>
            {intl.formatMessage({ id: 'versions.error.retry' })}
          </Button>
        </StateMessage>
      </>
    )
  }
  return <Text update={content.data} version={version} onRestore={onRestore} />
}

function Text({
  update,
  version,
  onRestore,
}: {
  update: Uint8Array
  version: Schema<'Version'>
  onRestore: VersionReaderProps['onRestore']
}) {
  const intl = useIntl()
  const nameOf = useVersionName()
  const document = useMemo(() => documentOf(update), [update])

  // A version that cannot be read is not one to go back to: the document would be replaced by what nobody has seen.
  const restore = document !== null && onRestore !== undefined ? () => onRestore(version) : undefined
  return (
    <>
      <ReaderBar version={version} offersRestore={onRestore !== undefined} onRestore={restore} />
      {document === null ? (
        <StateMessage
          role="alert"
          title={intl.formatMessage({ id: 'versions.reader.unreadable.title' })}
          description={intl.formatMessage({ id: 'versions.reader.unreadable.description' })}
        />
      ) : (
        <PreviewDocument
          document={document}
          label={intl.formatMessage({ id: 'versions.reader.text' }, { name: nameOf(version) })}
        />
      )}
    </>
  )
}

/** Fixed above the text: which version this is, that nothing here changes the document, and for owners the way back to it. */
function ReaderBar({
  version,
  offersRestore,
  onRestore,
}: {
  version: Schema<'Version'>
  /** The person is an owner: the place of the button is kept while the text is not there yet. */
  offersRestore: boolean
  onRestore?: (() => void) | undefined
}) {
  const intl = useIntl()
  const dateOf = useVersionDate()
  return (
    <div className={styles.bar}>
      <Alert
        tone="blue"
        className={styles.notice}
        title={intl.formatMessage({ id: 'versions.reader.bar.title' }, { date: dateOf(version) })}
      >
        {intl.formatMessage({ id: 'versions.reader.bar.description' })}
      </Alert>
      {offersRestore && (
        <div className={styles.action}>
          {onRestore !== undefined && (
            <Button onClick={onRestore}>{intl.formatMessage({ id: 'versions.reader.restore' })}</Button>
          )}
        </div>
      )}
    </div>
  )
}
