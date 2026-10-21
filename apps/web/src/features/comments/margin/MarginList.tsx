import type { ReactNode, Ref } from 'react'
import { useIntl } from 'react-intl'
import type { MarginPlan } from './useMarginLayout.ts'
import styles from './CommentsMargin.module.css'

/** The place of the label that stands between the threads on the text and those whose text is gone. */
export const labelId = 'removed-text'

export interface MarginListProps {
  listRef: Ref<HTMLUListElement>
  /** What the list has, in the order of the page: the id of each card, and `labelId` where the label goes. */
  items: readonly string[]
  /** Where each card is, once the page has been measured; `null` before, and while the margin is under the text. */
  plan: MarginPlan | null
  /** Whether the margin is beside the text, which is when the cards are placed by `plan`. */
  beside: boolean
  registerCard: (id: string) => (element: HTMLElement | null) => void
  registerLabel: (element: HTMLElement | null) => void
  /** The content of a card; `null` for an id the margin no longer has. */
  renderCard: (id: string) => ReactNode
  /** Escape in a card, which takes the person back to the text of its thread. */
  onEscape: (threadId: string) => void
}

/**
 * The cards of the margin as one list, in the order of the page, so that a thread that changes place is moved and not made
 * again, which would take with it what the person was writing in it. Beside the text each card has the top the layout gave it;
 * until it has one it is in the page and not seen, so nobody sees it in the wrong place.
 */
export function MarginList({
  listRef,
  items,
  plan,
  beside,
  registerCard,
  registerLabel,
  renderCard,
  onEscape,
}: MarginListProps) {
  const intl = useIntl()

  return (
    <ul
      ref={listRef}
      className={styles.list}
      aria-label={intl.formatMessage({ id: 'comments.threads.label' })}
      onKeyDown={(event) => {
        const card = (event.target as HTMLElement).closest<HTMLElement>('[data-thread-id]')
        // Escape in a field is for the field; anywhere else in a card it takes the person back to the text.
        if (event.key !== 'Escape' || card === null || event.target instanceof HTMLTextAreaElement) return
        onEscape(card.dataset['threadId'] ?? '')
      }}
    >
      {items.map((id) => {
        if (id === labelId) {
          return (
            <li
              key={id}
              ref={registerLabel}
              aria-hidden="true"
              className={styles.label}
              style={beside && plan?.labelTop != null ? { insetBlockStart: plan.labelTop } : undefined}
            >
              {intl.formatMessage({ id: 'comments.margin.orphans' })}
            </li>
          )
        }
        const content = renderCard(id)
        if (content === null) return null
        const top = plan?.tops.get(id)
        return (
          <li
            key={id}
            ref={registerCard(id)}
            className={styles.item}
            data-measuring={beside && plan === null ? '' : undefined}
            style={beside && top !== undefined ? { insetBlockStart: top } : undefined}
          >
            {content}
          </li>
        )
      })}
    </ul>
  )
}
