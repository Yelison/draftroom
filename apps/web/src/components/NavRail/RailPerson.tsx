import { useQuery } from '@tanstack/react-query'
import { Avatar } from '@yelison/forma-ui'
import { presenceLookOf } from '../../collab/presenceColor.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { meQuery } from '../../features/editor/meQuery.ts'
import styles from './NavRail.module.css'

/**
 * The person who is signed in, above what ends the session: their avatar and name. The name is always in the page and a
 * compact rail leaves it to the title and to a screen reader, as the workspace's. It is a plain row today; the menu of the
 * account will make it the trigger of one.
 */
export function RailPerson() {
  const me = useQuery(meQuery(useDataSource())).data
  if (me === undefined) return <div className={styles.person} />

  return (
    <div className={styles.person} title={me.name}>
      <Avatar name={me.name} size="small" tone={presenceLookOf(me.id).tone} decorative />
      <span className={styles.personName}>{me.name}</span>
    </div>
  )
}
