import { useQuery } from '@tanstack/react-query'
import { IconButton, Tooltip } from '@yelison/forma-ui'
import { useState } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { shortcutLabel } from '../editor/shortcuts.ts'
import { commentsMarginId, useCommentsView } from './commentsView.ts'
import { commentShortcut } from './highlightPlugin.ts'
import { threadsQuery } from './queries.ts'
import styles from './CommentsToggle.module.css'

/**
 * Shows and hides the comments of the margin from the bar above the sheet. It names the margin and says how many threads are
 * open (the count is also drawn, so a hidden margin does not hide that there is something to read), and it keeps the focus:
 * it is outside the margin, so hiding the margin never takes the focus with it. What it did is said in a region that was
 * already in the page.
 */
export function CommentsToggle({ documentId }: { documentId: string }) {
  const intl = useIntl()
  const { marginShown: open, toggleMargin: toggle } = useCommentsView()
  const threads = useQuery(threadsQuery(useDataSource(), documentId))
  // Counted, so doing it again is a new message and is announced again.
  const [presses, setPresses] = useState(0)
  const openThreads = threads.data?.filter(({ status }) => status === 'open').length ?? 0
  const state = open ? 'open' : 'closed'
  const label = intl.formatMessage({ id: 'comments.toggle.label' }, { count: openThreads })

  return (
    <span className={styles.toggle}>
      <Tooltip
        content={intl.formatMessage(
          { id: 'comments.toggle.tooltip' },
          { state, shortcut: shortcutLabel(commentShortcut) },
        )}
        placement="bottom-end"
      >
        {(trigger) => (
          <IconButton
            {...trigger}
            icon="comment"
            label={label}
            aria-expanded={open}
            aria-controls={commentsMarginId}
            className={styles.button}
            onClick={() => {
              toggle()
              setPresses((count) => count + 1)
            }}
          />
        )}
      </Tooltip>
      {openThreads > 0 && (
        <span aria-hidden="true" className={styles.count}>
          {intl.formatNumber(openThreads)}
        </span>
      )}
      <span role="status" className="forma-visually-hidden">
        {presses > 0 && <span key={presses}>{intl.formatMessage({ id: 'comments.toggle.announce' }, { state })}</span>}
      </span>
    </span>
  )
}
