import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'
import { describe, expect, it } from 'vitest'
import { createPasswords, hashParameters, type Argon2 } from './passwords.ts'

const passwords = createPasswords()

/** The real Argon2 with a count of what was verified, so a test can tell that a check ran without timing it. */
function countingArgon2(): Argon2 & { verified: string[] } {
  const verified: string[] = []
  return {
    verified,
    hash: argon2Hash,
    verify: (stored, password) => {
      verified.push(stored)
      return argon2Verify(stored, password)
    },
  }
}

describe('a stored password', () => {
  it('is an Argon2id hash with the parameters the decision records', async () => {
    const stored = await passwords.hash('correct horse battery staple')

    expect(stored).toMatch(
      new RegExp(
        `^\\$argon2id\\$v=19\\$m=${hashParameters.memoryCost},t=${hashParameters.timeCost},p=${hashParameters.parallelism}\\$`,
      ),
    )
  })

  it('does not hold the password', async () => {
    expect(await passwords.hash('correct horse battery staple')).not.toContain('horse')
  })

  it('is different each time for the same password, because the salt is', async () => {
    const [first, second] = await Promise.all([passwords.hash('same words'), passwords.hash('same words')])

    expect(first).not.toBe(second)
  })
})

describe('checking a password against what is stored', () => {
  it('accepts the right one and refuses another', async () => {
    const stored = await passwords.hash('correct horse battery staple')

    expect(await passwords.matches('correct horse battery staple', stored)).toBe(true)
    expect(await passwords.matches('correct horse battery stapler', stored)).toBe(false)
  })

  it('does not tell a letter written in one form from the same letter written in another', async () => {
    const composed = 'café au lait'
    const decomposed = 'café au lait'
    const stored = await passwords.hash(composed)

    expect(composed).not.toBe(decomposed)
    expect(await passwords.matches(decomposed, stored)).toBe(true)
  })

  it('does not tell full-width letters from the ones they stand for', async () => {
    const stored = await passwords.hash('password-12345')

    expect(await passwords.matches('ｐａｓｓｗｏｒｄ-12345', stored)).toBe(true)
  })

  it('refuses, and does not throw, a stored value that is not a hash', async () => {
    expect(await passwords.matches('anything at all', 'not a hash')).toBe(false)
  })
})

describe('checking a password for an account that does not exist', () => {
  it('still does the work of a check, against a hash that belongs to nobody, so the time says nothing', async () => {
    const argon2 = countingArgon2()

    expect(await createPasswords(argon2).matches('correct horse battery staple', null)).toBe(false)

    expect(argon2.verified).toHaveLength(1)
    expect(argon2.verified[0]).toMatch(/^\$argon2id\$/)
  })

  it('does the same work for an account that exists', async () => {
    const argon2 = countingArgon2()
    const stored = await passwords.hash('correct horse battery staple')

    await createPasswords(argon2).matches('another password entirely', stored)

    expect(argon2.verified).toEqual([stored])
  })

  it('uses a hash made with the same parameters as the real ones, or its time would differ', async () => {
    const argon2 = countingArgon2()
    await createPasswords(argon2).matches('x', null)

    expect(argon2.verified[0]).toContain(
      `m=${hashParameters.memoryCost},t=${hashParameters.timeCost},p=${hashParameters.parallelism}`,
    )
  })
})
