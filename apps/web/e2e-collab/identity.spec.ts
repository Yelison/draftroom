import { request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { environment } from './environment.ts'
import { expect, test } from './fixtures.ts'
import { demoPassword, people } from './people.ts'

/**
 * Who a browser is in the real-stack suite: the session cookie the server sets at sign-in, sent through the origin of the
 * app, which forwards it and rewrites nothing. The server resolves it for REST and for the collaboration socket alike.
 */
test.describe('the identity of the real-stack suite', () => {
  const app = () => playwrightRequest.newContext({ baseURL: environment.appOrigin })
  const credentials = { email: people.daniel, password: demoPassword }

  async function signedIn(): Promise<{ context: APIRequestContext; token: string; csrf: string }> {
    const context = await app()
    expect((await context.post('/api/auth/sign-in', { data: credentials })).status()).toBe(200)
    const cookies = (await context.storageState()).cookies
    const value = (name: string) => cookies.find((cookie) => cookie.name === name)?.value ?? ''
    return { context, token: value('dr_session'), csrf: value('dr_csrf') }
  }

  test('is the session cookie, through the origin of the app', async () => {
    const { context } = await signedIn()

    const response = await context.get('/api/me')

    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ email: people.daniel, name: 'Daniel Okafor' })
    await context.dispose()
  })

  test('is the same session for the server on its own port, which reads the cookie itself', async () => {
    const { context, token } = await signedIn()
    const api = await playwrightRequest.newContext({
      baseURL: environment.apiOrigin,
      extraHTTPHeaders: { cookie: `dr_session=${token}` },
    })

    const response = await api.get('/api/me')

    expect(response.status()).toBe(200)
    await Promise.all([context.dispose(), api.dispose()])
  })

  test('is nobody without the cookie, and not the old cookie of the test either', async () => {
    const anonymous = await app()
    const oldCookie = await playwrightRequest.newContext({
      baseURL: environment.appOrigin,
      extraHTTPHeaders: { cookie: `dr_dev_user=${people.daniel}` },
    })

    const statuses = [(await anonymous.get('/api/me')).status(), (await oldCookie.get('/api/me')).status()]

    expect(statuses).toEqual([401, 401])
    await Promise.all([anonymous.dispose(), oldCookie.dispose()])
  })

  test('is refused a change without the CSRF token, and allowed it with', async () => {
    const { context, csrf } = await signedIn()

    const without = await context.post('/api/auth/sign-out')
    const withToken = await context.post('/api/auth/sign-out', { headers: { 'x-csrf-token': csrf } })

    expect([without.status(), withToken.status()]).toEqual([403, 204])
    await context.dispose()
  })

  test('is told the same of a wrong password as of an account that does not exist', async () => {
    const context = await app()

    const wrong = await context.post('/api/auth/sign-in', {
      data: { ...credentials, password: 'not the password at all' },
    })
    const unknown = await context.post('/api/auth/sign-in', {
      data: { email: 'nobody@harborpine.example', password: demoPassword },
    })

    expect([wrong.status(), unknown.status()]).toEqual([401, 401])
    expect(await wrong.json()).toEqual(await unknown.json())
    await context.dispose()
  })
})
