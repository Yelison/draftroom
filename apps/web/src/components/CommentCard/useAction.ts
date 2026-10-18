import { useRef, useState } from 'react'
import type { Outcome } from './outcome.ts'

/**
 * One thing the person can ask for, with whether it is under way and why it failed. The failure stays until the next
 * attempt, so it is there for the person to read and the text they wrote is still in its field.
 */
export function useAction() {
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // A ref, not the state: two key presses in the same tick both see the state as it was before the first one.
  const running = useRef(false)

  /**
   * Runs the request; resolves with whether it worked. While one is under way another is not started (resolving `false`,
   * which the caller reads as "nothing to do"): a key that sends, pressed twice, must not send twice.
   */
  async function run(request: () => Promise<Outcome>): Promise<boolean> {
    if (running.current) return false
    running.current = true
    setPending(true)
    setFailure(null)
    const outcome = await request().finally(() => {
      running.current = false
    })
    setPending(false)
    if (!outcome.ok) setFailure(outcome.message)
    return outcome.ok
  }

  return { pending, failure, run, clearFailure: () => setFailure(null) }
}
