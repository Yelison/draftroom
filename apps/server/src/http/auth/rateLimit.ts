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

/**
 * What the routes ask of the limits. Each question answers with the seconds to wait, or `null` when the request may go on.
 * Only the failures of a sign-in are counted, so signing in does not use up what a person who has forgotten has left.
 */
export interface AttemptLimits {
  signInBlockedFor(request: FastifyRequest): Promise<number | null>
  /** Counts a sign-in that did not succeed, for its address of email and its network address. */
  signInFailed(request: FastifyRequest): Promise<void>
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

  return {
    async signInBlockedFor(request) {
      // Looked at without counting: a sign-in that succeeds is not an attempt against the limit.
      const looks = await Promise.all([
        perEmail(request, { increment: false }),
        perAddress(request, { increment: false }),
      ])
      const blocked = looks.flatMap((look) =>
        look.isAllowed || look.remaining > 0 ? [] : [seconds(look.ttlInSeconds)],
      )
      return blocked.length === 0 ? null : Math.max(...blocked)
    },

    async signInFailed(request) {
      await Promise.all([perEmail(request), perAddress(request)])
    },

    async signUpBlockedFor(request) {
      const count = await signUps(request)
      return count.isAllowed || !count.isExceeded ? null : seconds(count.ttlInSeconds)
    },
  }
}
