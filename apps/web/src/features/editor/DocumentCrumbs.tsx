import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'
import { useDataSource } from '../../data/useDataSource.ts'
import { foldersQuery } from '../documents/queries.ts'
import styles from './DocumentCrumbs.module.css'

/**
 * Where the document is: its folder, which takes the person to the folder's own page (all of its documents), or to the
 * Documents screen when it is in none, and its title, which is the page they are on. The folder arrives with the list of
 * folders that the explorer also reads; until it is there its place is kept, so the title does not move, and a list that
 * failed leaves the title alone.
 */
export function DocumentCrumbs({
  document,
}: {
  document: Pick<Schema<'Document'>, 'title' | 'folderId' | 'workspaceId'>
}) {
  const intl = useIntl()
  const folders = useQuery(foldersQuery(useDataSource(), document.workspaceId))
  const folder = folders.data?.items.find(({ id }) => id === document.folderId)
  const unfiled = document.folderId === null

  return (
    <nav aria-label={intl.formatMessage({ id: 'editor.crumbs.label' })} className={styles.crumbs}>
      <ol className={styles.list}>
        {(unfiled || folder !== undefined) && (
          <li className={styles.folder}>
            <Link to={unfiled ? '/documents' : `/folders/${document.folderId}`} className={styles.link}>
              {unfiled ? intl.formatMessage({ id: 'documents.details.noFolder' }) : folder?.name}
            </Link>
          </li>
        )}
        {!unfiled && folders.isPending && (
          <li aria-hidden="true" className={styles.folder}>
            <span className={styles.pending} />
          </li>
        )}
        <li aria-current="page" className={styles.title}>
          {document.title}
        </li>
      </ol>
    </nav>
  )
}
