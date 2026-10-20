import { FilterChip } from '@yelison/forma-ui'
import { useId, type ReactNode, type RefObject } from 'react'
import { useIntl } from 'react-intl'
import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import styles from './VersionTimeline.module.css'

export interface AutomaticToggleProps {
  pressed: boolean
  disabled?: boolean
  onToggle: () => void
  ref?: RefObject<HTMLButtonElement | null>
}

/** Shows or hides the versions the server makes on its own. Its name does not change with its state: `aria-pressed` does. */
export function AutomaticToggle({ pressed, disabled, onToggle, ref }: AutomaticToggleProps) {
  const intl = useIntl()
  return (
    <FilterChip ref={ref} selected={pressed} disabled={disabled} onClick={onToggle}>
      {intl.formatMessage({ id: 'versions.automatic.toggle' })}
    </FilterChip>
  )
}

/** The panel of the list: its headline and the control that filters it, which are there before the versions are. */
export function TimelineFrame({ toggle, children }: { toggle: ReactNode; children: ReactNode }) {
  const intl = useIntl()
  const headingId = useId()
  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <div className={styles.panelHeader}>
        <h2 id={headingId} className={styles.panelTitle}>
          {intl.formatMessage({ id: 'versions.list.label' })}
        </h2>
        {toggle}
      </div>
      <div className={styles.scroll}>{children}</div>
    </section>
  )
}

/** The list while the versions are on their way: rows with the measures of the real ones. */
export function TimelineSkeleton() {
  return (
    <TimelineFrame toggle={<AutomaticToggle pressed={false} disabled onToggle={() => {}} />}>
      <ListSkeleton rows={5} listClassName={styles.list} label="versions.loading" />
    </TimelineFrame>
  )
}
