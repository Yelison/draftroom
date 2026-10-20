import { Icon } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { useCreateDocument } from '../documents/actions/useCreateDocument.ts'
import { useTemplates } from '../templates/queries.ts'
import { SectionError } from './SectionError.tsx'
import { TilesSkeleton } from './TilesSkeleton.tsx'
import styles from './Home.module.css'

/** The document that "New document" makes, which the tiles make from a template. */
type Create = ReturnType<typeof useCreateDocument>

/**
 * The templates as tiles that start a document from them, named in the language of the app. The row has the height of
 * its tiles while they are on their way, and a failure to read them stays in the row: "New document" does not need them.
 */
export function TemplateTiles({ create }: { create: Create }) {
  const intl = useIntl()
  const { query, locale } = useTemplates()

  if (query.isSuccess && query.data.items.length === 0) return null

  return (
    <div>
      <h3 className={styles.tilesLabel}>{intl.formatMessage({ id: 'templates.pick' })}</h3>
      {query.isError ? (
        <div className={styles.tilesError}>
          <SectionError
            title="templates.error.title"
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : query.isPending ? (
        <div aria-busy="true">
          <TilesSkeleton />
          <p role="status" className="forma-visually-hidden">
            {intl.formatMessage({ id: 'templates.loading' })}
          </p>
        </div>
      ) : (
        <ul className={styles.tiles}>
          {query.data.items.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className={styles.tile}
                aria-busy={create.isPending && create.variables?.template?.id === template.id}
                aria-disabled={create.isPending}
                onClick={() => {
                  if (!create.isPending) create.mutate({ title: template.name, template: { id: template.id, locale } })
                }}
              >
                <span className={styles.tileIcon}>
                  <Icon name="file" />
                </span>
                <span className={styles.tileText}>
                  <span className={styles.tileName}>{template.name}</span>
                  <span className={styles.tileDescription}>{template.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
