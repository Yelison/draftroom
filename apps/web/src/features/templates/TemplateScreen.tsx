import { Button, buttonClassName } from '@yelison/forma-ui'
import { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'
import { Link, useParams } from 'react-router'
import type { Locale } from '../../i18n/locale.ts'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { useCreateDocument } from '../documents/actions/useCreateDocument.ts'
import { problemMessageId } from '../documents/problemMessage.ts'
import { StateMessage } from '../documents/StateMessage.tsx'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import { TemplatesFailure } from './TemplatesFailure.tsx'
import { useTemplates } from './queries.ts'
import styles from './TemplateScreen.module.css'

/** The screen of `/templates/:templateId`: what the template is for, and the way to start a document from it. */
export function TemplateScreen() {
  const { templateId = '' } = useParams()
  const { query, locale } = useTemplates()
  const intl = useIntl()
  const template = query.data?.items.find((row) => row.id === templateId)

  return (
    <div className={styles.screen}>
      {template === undefined ? <PageTitle titleId="screen.template" /> : <PageTitle title={template.name} />}
      {query.isPending && <TemplateLoading />}
      {query.isError && <TemplatesFailure onRetry={() => void query.refetch()} retrying={query.isFetching} />}
      {query.isSuccess && template === undefined && (
        <StateMessage
          title={intl.formatMessage({ id: 'templates.notFound.title' })}
          description={intl.formatMessage({ id: 'templates.notFound.description' })}
        >
          <BackToDocuments />
        </StateMessage>
      )}
      {template !== undefined && (
        <>
          <p className={styles.description}>{template.description}</p>
          <WorkspaceGate loading={<div className={styles.actionsPlaceholder} />}>
            {(workspaceId) => (
              <UseTemplate workspaceId={workspaceId} template={{ id: template.id, name: template.name, locale }} />
            )}
          </WorkspaceGate>
        </>
      )}
    </div>
  )
}

/** The measures of what is on its way (the description and the buttons), so nothing moves when it arrives. */
function TemplateLoading() {
  const intl = useIntl()

  return (
    <div aria-busy="true">
      <div className={styles.descriptionPlaceholder} />
      <div className={styles.actionsPlaceholder} />
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'templates.loading' })}
      </p>
    </div>
  )
}

function BackToDocuments() {
  const intl = useIntl()

  return (
    <Link to="/documents" className={buttonClassName({ variant: 'secondary' })}>
      {intl.formatMessage({ id: 'templates.back' })}
    </Link>
  )
}

interface UseTemplateProps {
  workspaceId: string
  template: { id: string; name: string; locale: Locale }
}

/** Creates the document from the template and opens it; a refusal is said next to the button that caused it. */
function UseTemplate({ workspaceId, template }: UseTemplateProps) {
  const intl = useIntl()
  const create = useCreateDocument(workspaceId)
  const actions = useRef<HTMLDivElement>(null)
  // After a failure to load the template the button that asked to try again is gone; the focus goes to the action that
  // has taken its place. On a first visit the focus is on the headline, which this leaves alone.
  useEffect(() => {
    if (document.activeElement === document.body) actions.current?.querySelector('button')?.focus()
  }, [])

  return (
    <div ref={actions} className={styles.actions}>
      <Button
        loading={create.isPending}
        onClick={() => create.mutate({ title: template.name, template: { id: template.id, locale: template.locale } })}
      >
        {intl.formatMessage({ id: 'templates.use' })}
      </Button>
      <BackToDocuments />
      {create.isError && (
        <p role="alert" className={styles.problem}>
          {intl.formatMessage({ id: problemMessageId(create.error) })}
        </p>
      )}
    </div>
  )
}
