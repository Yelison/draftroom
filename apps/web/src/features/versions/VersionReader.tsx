import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button } from '@yelison/forma-ui'
import { useMemo, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { StateMessage } from '../documents/StateMessage.tsx'
import { PreviewDocument } from './PreviewDocument.tsx'
import { versionContentQuery } from './queries.ts'
import { documentOf } from './versionDocument.ts'
import { useVersionDate, useVersionName } from './useVersionName.ts'
import styles from './VersionReader.module.css'

/** The panel beside the list, which is there before there is anything to read in it. */
export function ReaderPanel({ children }: { children?: ReactNode }) {
  const intl = useIntl()
  return (
    <section className={styles.panel} aria-label={intl.formatMessage({ id: 'versions.reader.label' })}>
      {children}
    </section>
  )
}

/** The panel while the versions are on their way: the room the text will take, so nothing moves when it arrives. */
export function ReaderPlaceholder() {
  return (
    <ReaderPanel>
      <div aria-busy="true" className={styles.skeleton} />
    </ReaderPanel>
  )
}

export interface VersionReaderProps {
  documentId: string
  /** The version to read, or `null` when there is none to choose yet. */
  version: Schema<'Version'> | null
  /** Given only to owners: the server refuses anyone else, and a button that can only fail is not offered. */
  onRestore?: ((version: Schema<'Version'>) => void) | undefined
}

/**
 * What the chosen version held, with a bar above it that says which version it is and that reading it changes nothing.
 * Restoring is offered from here, once the text has been read, and not from the list.
 */
export function VersionReader({ documentId, version, onRestore }: VersionReaderProps) {
  const intl = useIntl()
  return (
    <ReaderPanel>
      {version === null ? (
        <StateMessage title={intl.formatMessage({ id: 'versions.reader.empty' })} />
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
        <ReaderBar version={version} />
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
        <ReaderBar version={version} />
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
      <ReaderBar version={version} onRestore={restore} />
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
function ReaderBar({ version, onRestore }: { version: Schema<'Version'>; onRestore?: (() => void) | undefined }) {
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
      {onRestore !== undefined && (
        <Button onClick={onRestore}>{intl.formatMessage({ id: 'versions.reader.restore' })}</Button>
      )}
    </div>
  )
}
