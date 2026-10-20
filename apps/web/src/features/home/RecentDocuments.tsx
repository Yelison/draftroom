import type { UseInfiniteQueryResult, UseQueryResult, InfiniteData } from '@tanstack/react-query'
import type { Schema } from '@draftroom/contract'
import { useIntl } from 'react-intl'
import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import { RecentCard } from './RecentCard.tsx'
import { SectionError } from './SectionError.tsx'
import styles from './Home.module.css'

export interface RecentDocumentsProps {
  recents: UseInfiniteQueryResult<InfiniteData<Schema<'DocumentList'>>>
  folders: UseQueryResult<Schema<'FolderList'>>
}

/**
 * The documents changed most recently, as cards. They name their folder, so the section waits for the folders as well as
 * for the documents, and one retry asks again for whichever of the two failed.
 */
export function RecentDocuments({ recents, folders }: RecentDocumentsProps) {
  const intl = useIntl()
  const documents = recents.data?.pages[0]?.items
  const folderNames = new Map(folders.data?.items.map((folder) => [folder.id, folder.name]))
  const failed = recents.isError || folders.isError
  const body = (() => {
    if (failed) {
      return (
        <SectionError
          title="home.recent.error"
          retrying={recents.isFetching || folders.isFetching}
          onRetry={() => {
            if (recents.isError) void recents.refetch()
            if (folders.isError) void folders.refetch()
          }}
        />
      )
    }
    if (documents === undefined || folders.data === undefined) {
      return (
        <ListSkeleton rows={3} listClassName={`${styles.cards} ${styles.cardsSkeleton}`} label="home.recent.loading" />
      )
    }
    if (documents.length === 0)
      return <p className={styles.sentence}>{intl.formatMessage({ id: 'home.recent.empty' })}</p>
    return (
      <ul className={styles.cards}>
        {documents.map((document) => (
          <RecentCard
            key={document.id}
            document={document}
            folderName={document.folderId === null ? null : (folderNames.get(document.folderId) ?? null)}
          />
        ))}
      </ul>
    )
  })()

  return (
    <section aria-labelledby="home-recent">
      <h2 id="home-recent" className={styles.group}>
        {intl.formatMessage({ id: 'home.recent.title' })}
      </h2>
      {body}
    </section>
  )
}
