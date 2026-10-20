import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { useCreateDocument } from '../documents/actions/useCreateDocument.ts'
import { problemMessageId } from '../documents/problemMessage.ts'
import { TemplateTiles } from './TemplateTiles.tsx'
import styles from './Home.module.css'

/**
 * Where a document starts: blank, or from one of the templates. Both ways make the same document and open it, so they
 * share one request: while it is on its way no second document can be started from either.
 */
export function StartSection({ workspaceId }: { workspaceId: string }) {
  const intl = useIntl()
  const create = useCreateDocument(workspaceId)

  return (
    <section aria-labelledby="home-start" className={styles.start}>
      <div className={styles.startHead}>
        <div>
          <h2 id="home-start" className={styles.startTitle}>
            {intl.formatMessage({ id: 'home.start.title' })}
          </h2>
          <p className={styles.startDescription}>{intl.formatMessage({ id: 'home.start.description' })}</p>
        </div>
        <Button
          icon="plus"
          // The wait is shown where it was asked for: here for a blank document, on the tile for a template.
          loading={create.isPending && create.variables?.template === undefined}
          aria-disabled={create.isPending}
          onClick={() => {
            if (!create.isPending) create.mutate({ title: intl.formatMessage({ id: 'documents.untitled' }) })
          }}
        >
          {intl.formatMessage({ id: 'documents.new' })}
        </Button>
      </div>
      <TemplateTiles create={create} />
      {create.isError && (
        <p role="alert" className={styles.problem}>
          {intl.formatMessage({ id: problemMessageId(create.error) })}
        </p>
      )}
    </section>
  )
}
