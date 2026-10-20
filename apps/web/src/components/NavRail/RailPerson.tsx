import { useQuery } from '@tanstack/react-query'
import { Avatar } from '@yelison/forma-ui'
import { presenceLookOf } from '../../collab/presenceColor.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { meQuery } from '../../features/editor/meQuery.ts'
import styles from './NavRail.module.css'

/**
 * The person who is signed in, above what ends the session: their avatar and name. The name is always in the page and a
 * compact rail leaves it to the title and to a screen reader, as the workspace's. It is a plain row today; the menu of the
 * account will make it the trigger of one. It has no place of its own before it arrives: it is the last thing in the rail,
 * so nothing above it can be moved by it, as long as what ends the session arrives with it.
 */
export function RailPerson() {
  const me = useQuery(meQuery(useDataSource())).data
  if (me === undefined) return null

  return (
    <div className={styles.person} title={me.name}>
      <Avatar name={me.name} size="small" tone={presenceLookOf(me.id).tone} decorative />
      <span className={styles.personName}>{me.name}</span>
    </div>
  )
}
