import { useState } from 'react'
import type { Outcome } from './outcome.ts'

/**
 * One thing the person can ask for, with whether it is under way and why it failed. The failure stays until the next
 * attempt, so it is there for the person to read and the text they wrote is still in its field.
 */
export function useAction() {
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  /** Runs the request; resolves with whether it worked. */
  async function run(request: () => Promise<Outcome>): Promise<boolean> {
    setPending(true)
    setFailure(null)
    const outcome = await request()
    setPending(false)
    if (!outcome.ok) setFailure(outcome.message)
    return outcome.ok
  }

  return { pending, failure, run, clearFailure: () => setFailure(null) }
}
