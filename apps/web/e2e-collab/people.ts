import { createHttpDataSource } from '../src/data/http/HttpDataSource.ts'
import type { DataSource } from '../src/data/DataSource.ts'
import { environment } from './environment.ts'

/** The people of the demo workspace Harbor & Pine, by the address that is also their development identity. */
export const people = {
  marta: 'marta.ruiz@harborpine.example',
  daniel: 'daniel.okafor@harborpine.example',
  priya: 'priya.raman@harborpine.example',
  tom: 'tom.weller@harborpine.example',
} as const

export type DemoPerson = keyof typeof people

/**
 * The product's own HTTP client, as a person: the development identity header on every request, straight to the API.
 * Setting a scene up and taking access away go through REST, the way the screens of sharing will once they exist.
 */
export function restAs(person: DemoPerson): DataSource {
  return createHttpDataSource({
    baseUrl: environment.apiOrigin,
    collabUrl: environment.collaborationOrigin,
    // Outside a browser there is no `dr_csrf` cookie to read, and the development identity needs no token.
    csrfToken: () => undefined,
    fetch: (request) => {
      const headers = new Headers(request.headers)
      headers.set('x-dev-user', people[person])
      return fetch(new Request(request, { headers }))
    },
  })
}
