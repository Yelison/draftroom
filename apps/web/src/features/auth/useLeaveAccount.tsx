import { useCallback, useState, type ReactNode } from 'react'
import { leaveAccount } from '../../collab/leaveAccount.ts'
import { browserNetwork } from '../../collab/network.ts'
import { LeaveAccountDialogs, type LeaveReason, type Question } from './LeaveAccountDialogs.tsx'

/** `left`: what this browser kept of the account is cleared, or the person chose to go on without. `stayed`: they chose to keep things as they are. */
export type LeaveOutcome = 'left' | 'stayed'

export interface LeavingAccount {
  /** Clears what this browser kept of the account, asking the person what has to be asked. It never rejects. */
  leave(userId: string): Promise<LeaveOutcome>
  /** The dialogs that ask it: the screen that leaves renders them. */
  dialogs: ReactNode
}

/**
 * Leaving an account, by signing out or by signing in as somebody else (protocol §12.2): `leaveAccount` clears the copies
 * of the account, waits for what is on its way to be stored, and asks before it removes what never was. This puts the
 * questions in front of the person, and handles the one failure it can have, which a caller that went on as if it had
 * worked would hide: a browser that keeps copies and cannot list them rejects, nothing was removed, and the failure is
 * written down.
 *
 * Signing out then asks whether to go on without the purge. Switching goes on without asking: the person has already
 * signed in as the other account, and the copies are named for the one that is left, so they stay on this device and
 * are never the new account's.
 */
export function useLeaveAccount(reason: LeaveReason): LeavingAccount {
  const [question, setQuestion] = useState<Question | null>(null)

  const ask = useCallback(
    (build: (answer: (goOn: boolean) => void) => Question) =>
      new Promise<boolean>((resolve) => {
        setQuestion(
          build((goOn) => {
            setQuestion(null)
            resolve(goOn)
          }),
        )
      }),
    [],
  )

  const leave = useCallback(
    async (userId: string): Promise<LeaveOutcome> => {
      try {
        const outcome = await leaveAccount({
          userId,
          network: browserNetwork,
          confirm: (count) => ask((answer) => ({ kind: 'unstored', count, answer })),
        })
        // Keeping the changes that were never stored is staying, when it is the account that is being left that holds them.
        return outcome.purged || reason === 'switch' ? 'left' : 'stayed'
      } catch (error) {
        console.error('Draftroom could not clear the copies this browser keeps of the account', error)
        if (reason === 'switch') return 'left'
        return (await ask((answer) => ({ kind: 'unclearable', answer }))) ? 'left' : 'stayed'
      }
    },
    [ask, reason],
  )

  return { leave, dialogs: <LeaveAccountDialogs question={question} reason={reason} /> }
}
