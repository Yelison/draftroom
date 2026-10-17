import { request as playwrightRequest } from '@playwright/test'
import { environment } from './environment.ts'
import { expect, test } from './fixtures.ts'
import { people } from './people.ts'

/**
 * Until the session cookie exists (T7.1) the identity is the `X-Dev-User` header, and only the test proxy of the app's
 * origin turns the cookie of a browser context into it. The server itself reads no cookie, and the proxy trusts no header
 * from the browser.
 */
test.describe('the identity of the real-stack suite', () => {
  const asDaniel = { cookie: `dr_dev_user=${people.daniel}` }

  test('is the cookie, through the origin of the app', async () => {
    const app = await playwrightRequest.newContext({ baseURL: environment.appOrigin, extraHTTPHeaders: asDaniel })

    const response = await app.get('/api/me')

    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ email: people.daniel, name: 'Daniel Okafor' })
    await app.dispose()
  })

  test('is not the cookie for the server itself: it reads none', async () => {
    const api = await playwrightRequest.newContext({ baseURL: environment.apiOrigin, extraHTTPHeaders: asDaniel })

    const response = await api.get('/api/me')

    expect(response.status()).toBe(401)
    await api.dispose()
  })

  test('is not a header that the browser sends through the origin of the app', async () => {
    const app = await playwrightRequest.newContext({
      baseURL: environment.appOrigin,
      extraHTTPHeaders: { 'x-dev-user': people.daniel },
    })

    const response = await app.get('/api/me')

    expect(response.status()).toBe(401)
    await app.dispose()
  })
})
