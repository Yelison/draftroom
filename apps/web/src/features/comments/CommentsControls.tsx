import { useQuery } from '@tanstack/react-query'
import { Tabs } from '@yelison/forma-ui'
import { useMemo } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { ActivityPanel } from './ActivityPanel.tsx'
import { CommentsToggle } from './CommentsToggle.tsx'
import { useCommentsView } from './commentsView.ts'
import { threadsQuery } from './queries.ts'
import { ThreadFilter } from './ThreadFilter.tsx'
import styles from './CommentsControls.module.css'

/**
 * What the bar over the sheet has for the comments: which threads the margin shows, whether the activity of the document is
 * open at the edge of the window, and the button that shows and hides the margin. They are the same for every role that can
 * read the document: a reader sees the conversation too.
 */
export function CommentsControls({ documentId }: { documentId: string }) {
  const intl = useIntl()
  const { filter, setFilter, tab, setTab } = useCommentsView()
  const threads = useQuery(threadsQuery(useDataSource(), documentId))
  const counts = useMemo(() => {
    const all = threads.data ?? []
    const open = all.filter(({ status }) => status === 'open').length
    return { open, resolved: all.length - open, all: all.length }
  }, [threads.data])

  return (
    <div className={styles.controls}>
      <ThreadFilter value={filter} counts={counts} onChange={setFilter} />
      {/* The panels of the tabs are not here: the margin is the one of Comments and the activity opens at the edge of the window. */}
      <Tabs
        className={styles.tabs ?? ''}
        label={intl.formatMessage({ id: 'comments.panel.tabs' })}
        value={tab}
        onChange={(id) => setTab(id === 'activity' ? 'activity' : 'comments')}
        items={[
          { id: 'comments', label: intl.formatMessage({ id: 'comments.tab.comments' }), content: null },
          { id: 'activity', label: intl.formatMessage({ id: 'comments.tab.activity' }), content: null },
        ]}
      />
      <CommentsToggle documentId={documentId} />
      {tab === 'activity' && <ActivityPanel documentId={documentId} onClose={() => setTab('comments')} />}
    </div>
  )
}
