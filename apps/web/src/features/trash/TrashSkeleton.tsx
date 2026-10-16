import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import styles from './Trash.module.css'

/** What the trash shows while it is on its way: the rows of its column, which is the list of this screen and not the grid of the documents. */
export function TrashSkeleton() {
  return <ListSkeleton rows={4} listClassName={styles.list} label="trash.loading" />
}
