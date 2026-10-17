import { randomBytes } from 'node:crypto'
import { Algorithm, hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'

/**
 * Argon2id at the first configuration OWASP's Password Storage Cheat Sheet lists (19 MiB, two passes, one lane). It takes
 * about 70 ms on a development laptop: enough to make a guess cost, and little enough that a sign-in does not queue behind
 * the others on a small server. ADR 0004 says why these figures and what would make them change.
 */
export const hashParameters = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

/** What this module needs of Argon2, so a test can watch the checks that run. */
export interface Argon2 {
  hash(password: string, options: typeof hashParameters): Promise<string>
  verify(stored: string, password: string): Promise<boolean>
}

export interface Passwords {
  hash(password: string): Promise<string>
  /** Whether the password is the one behind `stored`; `null` stands for an account that does not exist. Never throws. */
  matches(password: string, stored: string | null): Promise<boolean>
}

/**
 * The same password can be typed as different code points (a composed é and an e with an accent, a full-width letter), so it
 * is normalised to NFKC before it is hashed or checked, as NIST SP 800-63B asks. The limits of the contract count the
 * password as it was sent, before this.
 */
const normalised = (password: string): string => password.normalize('NFKC')

export function createPasswords(argon2: Argon2 = { hash: argon2Hash, verify: argon2Verify }): Passwords {
  const hash = (password: string) => argon2.hash(normalised(password), hashParameters)

  // The hash of a password nobody knows, made on first use: checking an account that does not exist costs the same as
  // checking one that does, so how long a sign-in takes does not tell which addresses have an account. Made with the
  // same parameters as the real ones, by the same function, so the two can never drift apart.
  let nobodys: Promise<string> | undefined
  const hashOfNobody = () => (nobodys ??= hash(randomBytes(32).toString('hex')))

  return {
    hash,
    async matches(password, stored) {
      const against = stored ?? (await hashOfNobody())
      try {
        // The library compares the digests in constant time.
        const matched = await argon2.verify(against, normalised(password))
        return matched && stored !== null
      } catch {
        // A value that is not a hash: nobody can match it, and a sign-in must not answer differently for it.
        return false
      }
    },
  }
}
