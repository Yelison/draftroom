import type { Schema } from '@draftroom/contract'
import { Avatar, Icon, IconButton, Menu, type MenuItem } from '@yelison/forma-ui'
import type { ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { presenceLookOf } from '../../collab/presenceColor.ts'
import { DocumentRowLink } from '../../components/DocumentRow/DocumentRowLink.tsx'
import { Permission } from '../../components/Permission/Permission.tsx'
import { usePinDocument } from './actions/usePinDocument.ts'
import { PinButton } from './PinButton.tsx'
import { problemMessageId } from './problemMessage.ts'
import styles from './DocumentRows.module.css'

export type DocumentAction = 'rename-or-move' | 'archive'

/** Draws a text of the row (its title or its excerpt) in a way of its own, as a search marks what it found in it. */
export type DocumentTextRenderer = (text: string, field: 'title' | 'excerpt') => ReactNode

export interface DocumentListRowProps {
  document: Schema<'Document'>
  /** The folder the document is in, for the lists that mix folders (the pinned ones). */
  folderName?: string
  /**
   * Opens the dialog of an action. Renaming and moving is for editors and owners, archiving for owners; a list that cannot
   * archive leaves `onArchive` out and its rows do not offer it.
   */
  onRenameOrMove: (document: Schema<'Document'>) => void
  onArchive?: (document: Schema<'Document'>) => void
  /** How the title and the excerpt are drawn; plain text when left out. A document with no excerpt says so either way. */
  renderText?: DocumentTextRenderer
}

/**
 * A document in a list: its title opens it, and the row says who made it, the role of the person when it is not
 * ownership, when it changed, and whether it is pinned. The pin and the actions menu sit above the link that covers the row.
 */
export function DocumentListRow({ document, folderName, onRenameOrMove, onArchive, renderText }: DocumentListRowProps) {
  const intl = useIntl()
  const pin = usePinDocument()
  const canChange = document.role === 'editor' || document.role === 'owner'
  const items: MenuItem[] = [
    ...(canChange
      ? [
          {
            id: 'rename-or-move',
            label: intl.formatMessage({ id: 'documents.details.title' }),
            onSelect: () => onRenameOrMove(document),
          },
        ]
      : []),
    ...(document.role === 'owner' && onArchive !== undefined
      ? [
          {
            id: 'archive',
            label: intl.formatMessage({ id: 'documents.archive.action' }),
            onSelect: () => onArchive(document),
          },
        ]
      : []),
  ]

  return (
    <li className={styles.row}>
      <Icon name="file" className={styles.icon} />
      <span className={styles.text}>
        <span className={styles.titleLine}>
          <DocumentRowLink to={`/documents/${document.id}`} className={styles.title}>
            {renderText?.(document.title, 'title') ?? document.title}
          </DocumentRowLink>
          {folderName !== undefined && (
            <span className={styles.folderTag}>
              <Icon name="folder" />
              <span aria-hidden="true" className={styles.folderName}>
                {folderName}
              </span>
              <span className="forma-visually-hidden">
                {intl.formatMessage({ id: 'documents.row.inFolder' }, { name: folderName })}
              </span>
            </span>
          )}
        </span>
        <span className={styles.excerpt}>
          {document.excerpt === null ? (
            <span className={styles.noText}>{intl.formatMessage({ id: 'documents.row.noText' })}</span>
          ) : (
            (renderText?.(document.excerpt, 'excerpt') ?? document.excerpt)
          )}
        </span>
      </span>
      <span className={styles.meta}>
        <span className={styles.person}>
          <span className="forma-visually-hidden">{intl.formatMessage({ id: 'documents.row.createdBy' })}</span>
          <Avatar
            decorative
            size="small"
            name={document.createdBy.name}
            tone={presenceLookOf(document.createdBy.id).tone}
          />
          <span className={styles.personName}>{document.createdBy.name}</span>
        </span>
        <span>{document.role !== 'owner' && <Permission role={document.role} />}</span>
        <span className={styles.updated}>
          <span className="forma-visually-hidden">{intl.formatMessage({ id: 'documents.row.updatedLabel' })}</span>
          <time dateTime={document.updatedAt}>
            {intl.formatDate(document.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
        </span>
      </span>
      <span className={styles.actions}>
        {/* A toggle: the name stays and `aria-pressed` carries the state, which a screen reader says when it changes. */}
        <PinButton
          toggle
          pinned={document.pinned}
          label={intl.formatMessage({ id: 'documents.row.pin' }, { title: document.title })}
          // Not `disabled`: a disabled button gives up the focus, and the person is still on it when the answer arrives.
          onClick={() => {
            if (!pin.isPending) pin.mutate(document)
          }}
        />
        {pin.isError && (
          <span role="alert" className="forma-visually-hidden">
            {intl.formatMessage({ id: problemMessageId(pin.error) })}
          </span>
        )}
        {items.length > 0 && (
          <Menu label={intl.formatMessage({ id: 'documents.row.actions' }, { title: document.title })} items={items}>
            {(trigger) => (
              <IconButton
                {...trigger}
                icon="more"
                label={intl.formatMessage({ id: 'documents.row.actions' }, { title: document.title })}
              />
            )}
          </Menu>
        )}
      </span>
    </li>
  )
}
