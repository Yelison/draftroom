import type {} from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest } from 'fastify'

const minute = 60_000

/** At most `max` events in a window of `windowMs`, counted from the first. */
export interface RateRule {
  readonly max: number
  readonly windowMs: number
}

export interface RateLimits {
  /** Failed sign-ins for one address of email, whoever they come from: someone guessing the password of an account. */
  readonly signInFailuresPerEmail: RateRule
  /** Failed sign-ins from one network address, whichever accounts they name: someone trying many accounts. */
  readonly signInFailuresPerAddress: RateRule
  /** Accounts created from one network address. */
  readonly signUpsPerAddress: RateRule
}

/**
 * Ten wrong passwords for one account in a quarter of an hour is far more than a person who has forgotten theirs types,
 * and at one guess every 90 seconds an attacker who is held to it needs about three years for a million guesses. Thirty from
 * one address allows for a household or an office behind one address with a few forgetful people, and stops one machine
 * that tries many accounts. Ten accounts an hour from one address is a team signing up together and not a script.
 * ADR 0004 gives the reasoning and what is lost: whoever can send ten wrong passwords for an address can keep its owner
 * out for a quarter of an hour.
 */
export const defaultRateLimits: RateLimits = {
  signInFailuresPerEmail: { max: 10, windowMs: 15 * minute },
  signInFailuresPerAddress: { max: 30, windowMs: 15 * minute },
  signUpsPerAddress: { max: 10, windowMs: 60 * minute },
}

/** A sign-in that is let to go on: the route says how it ended, and what it held is given back. */
export interface SignInAttempt {
  /** `failed` when the credentials were not right: only that counts against the limit. Call it exactly once. */
  finish(failed: boolean): Promise<void>
}

/**
 * What the routes ask of the limits. A sign-in is asked for as it begins and answered as it ends; a sign-up is counted as
 * it begins. Each says the seconds to wait when it is one too many.
 */
export interface AttemptLimits {
  /**
   * Starts a sign-in, or refuses it with the seconds to wait. The attempt is **reserved before anything is awaited**: a
   * check that only looked at the failures counted so far would let every request that arrives while the first ones are
   * still being verified through, and what a verification costs (a query and Argon2id) is far longer than it takes a
   * burst to arrive. An attempt in flight counts against the limit until it is known how it ended, so a burst of any size
   * lets through no more than the limit allows. Only failures are kept afterwards, so signing in right still costs nothing.
   */
  beginSignIn(request: FastifyRequest): Promise<{ readonly blockedFor: number } | { readonly attempt: SignInAttempt }>
  /** Counts a sign-up, whatever comes of it, and says whether it is one too many. */
  signUpBlockedFor(request: FastifyRequest): Promise<number | null>
}

/** The address of email as a key: one account whatever its case, and however its letters are written. */
const keyOfEmail = (email: string): string => email.normalize('NFKC').trim().toLowerCase()

/** The email of a request body, which has already been checked by the contract but arrives typed as nothing. */
function emailOf(body: unknown): string {
  return typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
    ? body.email
    : ''
}

/**
 * The limits on `@fastify/rate-limit`, with its in-memory store: it counts in this process, so it is right for one
 * instance and not for several behind a balancer, each of which would count on its own (ADR 0004: a shared store is a
 * change of the plugin's `store` option, and nothing else here). The plugin must be registered on `app` before this runs.
 */
export function createAttemptLimits(app: FastifyInstance, limits: RateLimits): AttemptLimits {
  const rule = ({ max, windowMs }: RateRule) => ({ max, timeWindow: windowMs })
  const perEmail = app.createRateLimit({
    ...rule(limits.signInFailuresPerEmail),
    keyGenerator: (request) => `email:${keyOfEmail(emailOf(request.body))}`,
  })
  const perAddress = app.createRateLimit({
    ...rule(limits.signInFailuresPerAddress),
    keyGenerator: (request) => `address:${request.ip}`,
  })
  const signUps = app.createRateLimit({
    ...rule(limits.signUpsPerAddress),
    keyGenerator: (request) => `sign-up:${request.ip}`,
  })

  // `Retry-After` is whole seconds and at least one, whatever is left of the window.
  const seconds = (ttlInSeconds: number): number => Math.max(1, ttlInSeconds)

  // The attempts that have begun and not ended, by key. Node runs this on one thread, so adding to it before the first
  // `await` is what makes the reservation atomic. It lives in this process, as the counts do.
  const inFlight = new Map<string, number>()
  const reserve = (key: string): number => {
    const before = inFlight.get(key) ?? 0
    inFlight.set(key, before + 1)
    return before
  }
  const release = (key: string): void => {
    const now = (inFlight.get(key) ?? 1) - 1
    if (now === 0) inFlight.delete(key)
    else inFlight.set(key, now)
  }

  return {
    async beginSignIn(request) {
      const keys = [`email:${keyOfEmail(emailOf(request.body))}`, `address:${request.ip}`]
      const before = keys.map(reserve)
      const releaseAll = () => keys.forEach(release)
      let blocked: number[]
      try {
        // Looked at without counting: a sign-in that succeeds is not an attempt against the limit. The ones in flight
        // ahead of this one are, as if they had failed.
        const looks = await Promise.all([
          perEmail(request, { increment: false }),
          perAddress(request, { increment: false }),
        ])
        blocked = looks.flatMap((look, index) =>
          look.isAllowed || look.remaining - (before[index] ?? 0) > 0 ? [] : [seconds(look.ttlInSeconds)],
        )
      } catch (error) {
        releaseAll()
        throw error
      }
      if (blocked.length > 0) {
        releaseAll()
        return { blockedFor: Math.max(...blocked) }
      }
      return {
        attempt: {
          async finish(failed) {
            try {
              // Counted before it is given back, so the limit never sees less than there is.
              if (failed) await Promise.all([perEmail(request), perAddress(request)])
            } finally {
              releaseAll()
            }
          },
        },
      }
    },

    async signUpBlockedFor(request) {
      // Counted as it begins, before any work: the accounts that a burst may create are the limit and no more.
      const count = await signUps(request)
      return count.isAllowed || !count.isExceeded ? null : seconds(count.ttlInSeconds)
    },
  }
}
