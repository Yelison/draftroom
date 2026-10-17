import type { Kysely } from 'kysely'
import type { Database } from '../../src/db/tables.ts'
import type { AuthProvider } from '../../src/http/auth/auth-provider.ts'
import { createCookieSessions, withDevelopmentIdentity } from '../../src/http/auth/cookie-session.ts'
import {
  cookieNamesFor,
  createSessionCookies,
  type CookieNames,
  type SessionCookies,
} from '../../src/http/auth/cookies.ts'
import { createCsrf, csrfHeaderName, type Csrf } from '../../src/http/auth/csrf.ts'
import { createDevices, type Devices } from '../../src/http/auth/devices.ts'
import { createDevIdentity } from '../../src/http/auth/devIdentity.ts'
import { createSessions, type Sessions } from '../../src/http/auth/sessions.ts'
import type { LiveAccess } from '../../src/http/live-access.ts'
import { silentLiveAccess } from './broadcasters.ts'
import type { ContractResponse } from './contract-client.ts'
import type { TestApp } from './test-app.ts'

export const testSessionSecret = 'a-session-secret-that-is-long-enough-for-the-tests'

export interface SessionStack {
  readonly sessions: Sessions
  readonly csrf: Csrf
  readonly sessionCookies: SessionCookies
  readonly devices: Devices
  /** The names the cookies of this stack have: `__Host-` ones only when it is `secure`. */
  readonly names: CookieNames
  /** The cookie provider alone: what production runs. */
  readonly provider: AuthProvider
  /** The cookie provider with the development header behind it: what development and the tests run. */
  readonly withDevelopmentHeader: AuthProvider
}

export interface SessionStackOptions {
  readonly secure?: boolean
  readonly now?: () => Date
}

/** What a server is given to have sessions: the store, the CSRF check, the cookies it sets and the provider that reads them. */
export function sessionStackFor(
  database: Kysely<Database>,
  { secure = false, now }: SessionStackOptions = {},
): SessionStack {
  const sessions = createSessions({ database, ...(now === undefined ? {} : { now }) })
  const csrf = createCsrf(testSessionSecret)
  const names = cookieNamesFor(secure)
  const provider = createCookieSessions({ sessions, csrf, names })
  return {
    sessions,
    csrf,
    names,
    sessionCookies: createSessionCookies({ csrf, secure }),
    devices: createDevices({ secret: testSessionSecret, cookieName: names.device, secure }),
    provider,
    withDevelopmentHeader: withDevelopmentIdentity(provider, createDevIdentity(database)),
  }
}

/** A cookie as a `Set-Cookie` header sets it. */
export interface SetCookie {
  readonly value: string
  readonly httpOnly: boolean
  readonly secure: boolean
  readonly sameSite: string | undefined
  readonly path: string | undefined
  readonly domain: string | undefined
  readonly expires: Date | undefined
}

function parseSetCookie(line: string): [string, SetCookie] {
  const [pair = '', ...attributes] = line.split(';').map((part) => part.trim())
  const separator = pair.indexOf('=')
  const flag = (name: string) => attributes.some((attribute) => attribute.toLowerCase() === name)
  const attribute = (name: string) =>
    attributes.find((candidate) => candidate.toLowerCase().startsWith(`${name}=`))?.slice(name.length + 1)
  const expires = attribute('expires')
  return [
    pair.slice(0, separator),
    {
      value: decodeURIComponent(pair.slice(separator + 1)),
      httpOnly: flag('httponly'),
      secure: flag('secure'),
      sameSite: attribute('samesite'),
      path: attribute('path'),
      domain: attribute('domain'),
      expires: expires === undefined ? undefined : new Date(expires),
    },
  ]
}

/** The cookies a response sets, by name: the last one wins, as in a browser. */
export function setCookiesOf(response: Pick<ContractResponse, 'headers'>): Record<string, SetCookie> {
  const header = response.headers['set-cookie']
  const lines = Array.isArray(header) ? header : typeof header === 'string' ? [header] : []
  return Object.fromEntries(lines.map(parseSetCookie))
}

export interface BrowserRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly url: string
  readonly body?: object
  /** Other headers of the request, such as the development one. */
  readonly headers?: Record<string, string>
  /** The network address the request comes from, for a test that needs several. */
  readonly remoteAddress?: string
  /** What a page does for a request that changes something: the `dr_csrf` cookie, in the header. Defaults to doing it. */
  readonly sendCsrf?: boolean
}

/**
 * What a browser does with an app that sets cookies: it keeps them, sends them back, forgets what expires or is cleared,
 * and (as the page does) copies the CSRF cookie into the header of a request that changes something.
 */
export class Browser {
  readonly cookies = new Map<string, string>()
  private readonly server: TestApp
  private readonly csrfCookieName: string

  /** `names` are the ones the server's cookies have; a server that is `secure` uses the `__Host-` ones. */
  constructor(server: TestApp, { csrf }: Pick<CookieNames, 'csrf'> = cookieNamesFor(false)) {
    this.server = server
    this.csrfCookieName = csrf
  }

  async request({
    method,
    url,
    body,
    headers = {},
    sendCsrf = true,
    remoteAddress,
  }: BrowserRequest): Promise<ContractResponse> {
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ')
    const csrf = this.cookies.get(this.csrfCookieName)
    const response = await this.server.request({
      method,
      url,
      headers: {
        ...(cookie === '' ? {} : { cookie }),
        ...(sendCsrf && method !== 'GET' && csrf !== undefined ? { [csrfHeaderName]: csrf } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { payload: body }),
      ...(remoteAddress === undefined ? {} : { remoteAddress }),
    })
    for (const [name, set] of Object.entries(setCookiesOf(response))) {
      if (set.value === '' || (set.expires !== undefined && set.expires.getTime() <= Date.now()))
        this.cookies.delete(name)
      else this.cookies.set(name, set.value)
    }
    return response
  }

  /** Plants a cookie the way a page or another site could: no server set it. */
  plant(name: string, value: string): void {
    this.cookies.set(name, value)
  }
}

export const goodPassword = 'correct horse battery staple'

let counter = 0
/** An address nobody has signed up with. */
export const freshEmail = (): string => `new-${++counter}-${Math.random().toString(36).slice(2, 8)}@harborpine.example`

export interface Account {
  readonly email: string
  readonly password: string
  readonly name: string
}

/** The request body of an account that has not signed up yet. */
export const newAccount = (overrides: Partial<Account> = {}): Account => ({
  email: freshEmail(),
  password: goodPassword,
  name: 'Marta Ruiz',
  ...overrides,
})

/** A `LiveAccess` that writes down the sessions that ended, and lets a test look at the world at that moment. */
export function recordingLiveAccess(onSessionEnded: (sessionId: string) => Promise<void> = async () => undefined) {
  const sessionsEnded: string[] = []
  const liveAccess: LiveAccess = {
    ...silentLiveAccess,
    async sessionEnded(sessionId) {
      sessionsEnded.push(sessionId)
      await onSessionEnded(sessionId)
    },
  }
  return { liveAccess, sessionsEnded }
}
