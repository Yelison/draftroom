import { afterAll, describe, expect, it } from 'vitest'
import { unreachableDatabaseUrl } from '../../../test/support/unreachable-database.ts'
import { createDatabase } from '../../db/database.ts'
import { devUserHeader } from './devIdentity.ts'
import { authProviderFor } from './select.ts'

// A database nobody can reach: a provider that asks it anything fails, so a provider that answers has not asked.
const database = createDatabase(unreachableDatabaseUrl)
afterAll(() => database.destroy())

const requestAs = (email: string) => ({ headers: { [devUserHeader]: email } })

describe('the identity of a request, by environment', () => {
  it('is never taken from the development header in production, whoever the header names', async () => {
    const provider = authProviderFor('production', database)

    expect(await provider.authenticate(requestAs('marta.ruiz@harborpine.example'), { csrf: false })).toEqual({
      status: 'unauthenticated',
    })
  })

  it.each(['development', 'test'] as const)('is looked up from the development header in %s', async (environment) => {
    const provider = authProviderFor(environment, database)

    // The lookup reaches for the database, which is not there: the header was read and a person was being looked for.
    await expect(provider.authenticate(requestAs('marta.ruiz@harborpine.example'), { csrf: false })).rejects.toThrow()
  })

  it.each([undefined, '', 'x'.repeat(255)])(
    'asks nobody about a header that cannot be an email (%s)',
    async (email) => {
      const provider = authProviderFor('test', database)
      const request = { headers: email === undefined ? {} : { [devUserHeader]: email } }

      expect(await provider.authenticate(request, { csrf: false })).toEqual({ status: 'unauthenticated' })
    },
  )

  it('asks nobody about a header that is sent twice', async () => {
    const provider = authProviderFor('test', database)
    const request = { headers: { [devUserHeader]: ['a@harborpine.example', 'b@harborpine.example'] } }

    expect(await provider.authenticate(request, { csrf: false })).toEqual({ status: 'unauthenticated' })
  })
})
