import { useQuery } from '@tanstack/react-query'
import { IconButton, Tooltip } from '@yelison/forma-ui'
import { useState } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { commentsPanelId, useCommentsPanel } from './commentsPanelState.ts'
import { threadsQuery } from './queries.ts'
import styles from './CommentsToggle.module.css'

/**
 * Opens and closes the comments panel from the band above the sheet. It names the panel and says how many threads are open
 * (the count is also drawn, so a closed panel does not hide that there is something to read), and it keeps the focus: it is
 * outside the panel, so closing the panel never takes the focus with it. What it did is said in a region that was already in
 * the page.
 */
export function CommentsToggle({ documentId }: { documentId: string }) {
  const intl = useIntl()
  const { open, toggle } = useCommentsPanel()
  const threads = useQuery(threadsQuery(useDataSource(), documentId))
  // Counted, so doing it again is a new message and is announced again.
  const [presses, setPresses] = useState(0)
  const openThreads = threads.data?.filter(({ status }) => status === 'open').length ?? 0
  const state = open ? 'open' : 'closed'
  const label = intl.formatMessage({ id: 'comments.toggle.label' }, { count: openThreads })

  return (
    <span className={styles.toggle}>
      <Tooltip
        content={intl.formatMessage({ id: 'comments.toggle.tooltip' }, { state })}
        placement="bottom-end"
        describe={false}
      >
        {(trigger) => (
          <IconButton
            {...trigger}
            icon="comment"
            label={label}
            aria-expanded={open}
            aria-controls={commentsPanelId}
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
