import type { Schema } from '@draftroom/contract'
import { useMemo, useState } from 'react'
import { ReaderPanel, ReaderPlaceholder, VersionReader } from './VersionReader.tsx'
import { useVersions } from './useVersions.ts'
import { VersionTimeline } from './VersionTimeline.tsx'
import styles from './Versions.module.css'

export interface VersionsBodyProps {
  documentId: string
  /** Given only to owners: the reader offers to restore the version it shows. */
  onRestore?: ((version: Schema<'Version'>) => void) | undefined
}

/**
 * The list of versions and the one that is read beside it. The reader starts on the newest version and stays on the one
 * the person chose: a version that arrives meanwhile (saved by someone, or the one a restore makes) does not replace
 * the text under their eyes.
 */
export function VersionsBody({ documentId, onRestore }: VersionsBodyProps) {
  const { query, versions } = useVersions(documentId)
  const [showAutomatic, setShowAutomatic] = useState(false)
  const [readingId, setReadingId] = useState<string | null>(null)

  // The version being read stays in the list when the automatic ones are hidden, so the list still says which it is.
  const shown = useMemo(
    () =>
      showAutomatic ? versions : versions.filter((version) => version.kind !== 'auto' || version.id === readingId),
    [versions, showAutomatic, readingId],
  )
  const first = shown[0]
  if (readingId === null && first !== undefined) setReadingId(first.id)
  const reading = versions.find((version) => version.id === readingId) ?? null

  return (
    <div className={styles.body}>
      <VersionTimeline
        query={query}
        versions={shown}
        arrived={versions.length}
        selectedId={readingId}
        showAutomatic={showAutomatic}
        onSelect={(version) => setReadingId(version.id)}
        onToggleAutomatic={() => setShowAutomatic((shown) => !shown)}
      />
      {query.isPending ? (
        <ReaderPlaceholder />
      ) : query.isError ? (
        <ReaderPanel />
      ) : (
        <VersionReader documentId={documentId} version={reading} onRestore={onRestore} />
      )}
    </div>
  )
}
