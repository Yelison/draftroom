import { IconButton } from '@yelison/forma-ui'
import type { ComponentProps } from 'react'
import styles from './PinButton.module.css'

export interface PinButtonProps extends Pick<ComponentProps<typeof IconButton>, 'label' | 'onClick'> {
  /** Whether the document is pinned: the star is drawn filled, so the state is seen and not only announced. */
  pinned: boolean
  /** For a button that keeps its name and says its state (`aria-pressed`); one named for what it does next leaves it out. */
  toggle?: boolean
}

/** The star that pins a document, or takes the pin off. */
export function PinButton({ pinned, toggle = false, ...props }: PinButtonProps) {
  return (
    <IconButton
      {...props}
      icon="star"
      className={styles.pin}
      data-pinned={pinned}
      {...(toggle ? { 'aria-pressed': pinned } : {})}
    />
  )
}
