import { Button, Dialog } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'

/** Why the account is being left: the person signs out, or signs in as somebody else on this browser. */
export type LeaveReason = 'sign-out' | 'switch'

/** What is asked of the person while an account is left, and the way they answer: `true` goes on, `false` does not. */
export type Question =
  | { readonly kind: 'unstored'; readonly count: number; readonly answer: (goOn: boolean) => void }
  | { readonly kind: 'unclearable'; readonly answer: (goOn: boolean) => void }

const unstoredTexts = {
  'sign-out': {
    description: 'account.leave.unstored.description',
    refuse: 'account.leave.unstored.cancel',
    accept: 'account.leave.unstored.confirm',
  },
  switch: { description: 'auth.switch.description', refuse: 'auth.switch.keep', accept: 'auth.switch.discard' },
} as const satisfies Record<LeaveReason, Record<string, MessageId>>

export interface LeaveAccountDialogsProps {
  question: Question | null
  reason: LeaveReason
}

/**
 * The two things a person may be asked when an account is left (protocol §12.2): whether to lose changes that were never
 * stored, and whether to go on when this browser cannot say what it keeps. The way that keeps things as they are is first,
 * so it is the one that has the focus; closing the dialog any other way is the same answer.
 */
export function LeaveAccountDialogs({ question, reason }: LeaveAccountDialogsProps) {
  const intl = useIntl()
  const answer = question?.answer ?? (() => undefined)

  if (question?.kind === 'unclearable') {
    return (
      <Dialog
        open
        onClose={() => answer(false)}
        title={intl.formatMessage({ id: 'account.leave.unclearable.title' })}
        description={intl.formatMessage({ id: 'account.leave.unclearable.description' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => answer(false)}>
              {intl.formatMessage({ id: 'account.leave.unclearable.cancel' })}
            </Button>
            <Button variant="danger" onClick={() => answer(true)}>
              {intl.formatMessage({ id: 'account.leave.unclearable.confirm' })}
            </Button>
          </>
        }
      />
    )
  }

  const texts = unstoredTexts[reason]
  return (
    <Dialog
      open={question !== null}
      onClose={() => answer(false)}
      title={intl.formatMessage({ id: 'account.leave.unstored.title' }, { count: question?.count ?? 0 })}
      description={intl.formatMessage({ id: texts.description })}
      footer={
        <>
          <Button variant="secondary" onClick={() => answer(false)}>
            {intl.formatMessage({ id: texts.refuse })}
          </Button>
          <Button variant="danger" onClick={() => answer(true)}>
            {intl.formatMessage({ id: texts.accept })}
          </Button>
        </>
      }
    />
  )
}
