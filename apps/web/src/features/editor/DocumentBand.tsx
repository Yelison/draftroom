import type { Schema } from '@draftroom/contract'
import type { RefObject } from 'react'
import { Presence, type PresenceEntry } from '../../components/Presence/Presence.tsx'
import { SyncStatus } from '../../components/SyncStatus/SyncStatus.tsx'
import type { CollabSnapshot } from '../../collab/session.ts'
import { ShareControl } from '../sharing/ShareControl.tsx'
import { VersionsButton } from '../versions/VersionsButton.tsx'
import { DocumentCrumbs } from './DocumentCrumbs.tsx'
import styles from './DocumentBand.module.css'

export interface DocumentBandProps {
  document: Schema<'Document'>
  snapshot: Pick<CollabSnapshot, 'state' | 'keepsCopy'>
  people: readonly PresenceEntry[]
  /** How many avatars are drawn before the rest are counted, and the zone that decides it (`useFittingLimit`). */
  peopleLimit: number
  peopleZone: RefObject<HTMLDivElement | null>
}

/**
 * The band over the document, which stays in sight as the page scrolls: where the document is, who is in it, whether what
 * was written is stored, and the way to its history and to sharing it. It is there for every role, so a reader's screen is
 * laid out like an editor's and nothing moves when the document arrives and says which one this person is.
 */
export function DocumentBand({ document, snapshot, people, peopleLimit, peopleZone }: DocumentBandProps) {
  return (
    <div className={styles.band}>
      <div className={styles.crumbs}>
        <DocumentCrumbs document={document} />
      </div>
      {/* The people give way: the state keeps its width, and what does not fit is not drawn (`useFittingLimit` counts it). */}
      <div ref={peopleZone} className={styles.people}>
        <Presence people={people} limit={peopleLimit} />
      </div>
      <div className={styles.state}>
        <SyncStatus state={snapshot.state} keepsCopy={snapshot.keepsCopy} />
        <VersionsButton documentId={document.id} />
        <ShareControl document={document} />
      </div>
    </div>
  )
}
