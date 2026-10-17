import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { useSearchParams } from 'react-router'
import { useDataSource } from '../../data/useDataSource.ts'
import { QueryFailure } from '../documents/QueryFailure.tsx'
import { StateMessage } from '../documents/StateMessage.tsx'
import { accessFromParam, type SharedAccess } from './accessFilter.ts'
import { SharedFilters } from './SharedFilters.tsx'
import { SharedPreview } from './SharedPreview.tsx'
import { SharedSkeleton } from './SharedSkeleton.tsx'
import { SharedTable } from './SharedTable.tsx'
import { sharedListQuery } from './sharedQuery.ts'
import styles from './Shared.module.css'

/** How many documents the table shows before "Load more": the list has no cursor, so the screen pages what it has. */
export const pageSize = 25

/**
 * The documents shared with the person, narrowed by the permission in `?access=` and previewing the one in `?selected=`.
 * The filters are outside what loads, so the focus stays on the chip that was pressed. How many documents the filter
 * left is said in a live region that was in the page before there was anything to say.
 */
export function Shared({ workspaceId }: { workspaceId: string }) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const [params, setParams] = useSearchParams()
  const access = accessFromParam(params.get('access'))
  const selectedId = params.get('selected') ?? undefined
  const query = useQuery(sharedListQuery(dataSource, workspaceId, access))
  const allChip = useRef<HTMLButtonElement>(null)

  const filter = (next: SharedAccess | undefined) => setParams(next === undefined ? {} : { access: next })
  const select = (id: string | undefined) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (id === undefined) next.delete('selected')
      else next.set('selected', id)
      return next
    })

  const count = query.data?.items.length
  const announcement = count === undefined ? '' : intl.formatMessage({ id: 'shared.results' }, { count })

  return (
    <>
      <SharedFilters access={access} onChange={filter} allChip={allChip} />
      {query.isPending && <SharedSkeleton />}
      {query.isError && <QueryFailure onRetry={() => void query.refetch()} retrying={query.isFetching} />}
      {query.isSuccess && query.data.items.length === 0 && (
        <StateMessage
          title={intl.formatMessage({ id: access === undefined ? 'shared.empty.title' : 'shared.emptyFiltered.title' })}
          description={intl.formatMessage({
            id: access === undefined ? 'shared.empty.description' : 'shared.emptyFiltered.description',
          })}
        >
          {access !== undefined && (
            <Button
              variant="secondary"
              onClick={() => {
                filter(undefined)
                allChip.current?.focus()
              }}
            >
              {intl.formatMessage({ id: 'shared.emptyFiltered.action' })}
            </Button>
          )}
        </StateMessage>
      )}
      {query.isSuccess && query.data.items.length > 0 && (
        // A new filter is a new list: it starts on its first page.
        <SharedResults key={access ?? 'all'} documents={query.data.items} selectedId={selectedId} onSelect={select} />
      )}
      <p role="status" className="forma-visually-hidden">
        {/* A new element for each filter: two filters with the same count are still two answers to the same press. */}
        {announcement !== '' && <span key={access ?? 'all'}>{announcement}</span>}
      </p>
    </>
  )
}

interface SharedResultsProps {
  documents: readonly Schema<'Document'>[]
  selectedId: string | undefined
  onSelect: (id: string | undefined) => void
}

function SharedResults({ documents, selectedId, onSelect }: SharedResultsProps) {
  const intl = useIntl()
  const [visible, setVisible] = useState(pageSize)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  // The document whose button takes the focus when it arrives: the first of the page "Load more" brought.
  const focusOnArrival = useRef<string | undefined>(undefined)

  // A selected document is shown whatever page it is on: an address that names the 30th document opens its preview, with
  // the rows up to it, instead of ignoring it. What is shown only grows: closing the preview must not take rows away from
  // under the focus. Adjusted while rendering, so that no effect has to set state.
  const selectedIndex = documents.findIndex((document) => document.id === selectedId)
  if (selectedIndex >= visible) setVisible(selectedIndex + 1)
  const shown = documents.slice(0, visible)
  const selected = documents[selectedIndex]

  const previewButton = (documentId: string) => (button: HTMLButtonElement | null) => {
    if (button === null) {
      buttons.current.delete(documentId)
      return
    }
    buttons.current.set(documentId, button)
    if (focusOnArrival.current === documentId) {
      focusOnArrival.current = undefined
      button.focus()
    }
  }

  return (
    <>
      <div className={styles.content} data-previewing={selected === undefined ? undefined : ''}>
        <SharedTable
          documents={shown}
          selectedId={selected?.id}
          previewing={selected !== undefined}
          onSelect={(document) => onSelect(document.id === selected?.id ? undefined : document.id)}
          previewButton={previewButton}
        />
        {selected !== undefined && (
          <SharedPreview
            document={selected}
            onClose={() => {
              onSelect(undefined)
              buttons.current.get(selected.id)?.focus()
            }}
          />
        )}
      </div>
      {documents.length > shown.length && (
        <Button
          className={styles.more}
          variant="secondary"
          onClick={() => {
            focusOnArrival.current = documents[shown.length]?.id
            setVisible(shown.length + pageSize)
          }}
        >
          {intl.formatMessage({ id: 'documents.loadMore' })}
        </Button>
      )}
    </>
  )
}
