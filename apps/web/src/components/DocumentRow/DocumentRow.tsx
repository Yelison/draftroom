import { Icon, type IconName } from '@yelison/forma-ui'
import type { ComponentProps, ReactNode } from 'react'
import styles from './DocumentRow.module.css'

/**
 * Which row it is. `selected` is the document that is open; the keyboard focus is a different thing and is drawn on its
 * own (the ring that `:focus-visible` and `:focus-within` give), so a row can be both, either or neither. `archived`
 * dims a document that has left the lists, and `folder` is a row that holds others.
 */
export type DocumentRowVariant = 'default' | 'selected' | 'archived' | 'folder'

export interface DocumentRowProps extends Omit<ComponentProps<'div'>, 'title' | 'children'> {
  variant?: DocumentRowVariant
  /** The name of the document or folder: a plain text, or the link that opens it. */
  title: ReactNode
  /** The glyph before the name, when the variant's own (a folder or a document) is not the right one. */
  icon?: IconName
  /** A second line: the excerpt and the date of the document. */
  meta?: ReactNode
  /** Something that acts on the row, such as its actions button. It stays clear of the title's own hit area. */
  trailing?: ReactNode
  /** A raised row of its own, for the groups of cards of the list screens; the explorer's rows have none. */
  card?: boolean
  /** Draws the disclosure chevron of a folder in a tree: open when `true`, closed when `false`. */
  expanded?: boolean | undefined
}

/**
 * A document or a folder in a list or in the explorer. It is presentational: the element carries whatever the place it is
 * used in needs (a `treeitem` role and its keyboard in the explorer, a link in a list) through the props of a `div`.
 */
export function DocumentRow({
  variant = 'default',
  title,
  icon,
  meta,
  trailing,
  card = false,
  expanded,
  className,
  ...props
}: DocumentRowProps) {
  const classNames = [styles.row, styles[variant], card && styles.card, className].filter(Boolean).join(' ')

  return (
    <div {...props} data-variant={variant} className={classNames}>
      {expanded !== undefined && (
        <Icon name="chevron" className={`${styles.chevron} ${expanded ? '' : styles.collapsed}`} />
      )}
      <Icon name={icon ?? (variant === 'folder' ? 'folder' : 'file')} className={styles.icon} />
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {meta !== undefined && <span className={styles.meta}>{meta}</span>}
      </span>
      {trailing !== undefined && <span className={styles.trailing}>{trailing}</span>}
    </div>
  )
}
