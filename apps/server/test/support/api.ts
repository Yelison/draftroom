import { devUserHeader } from '../../src/http/auth/devIdentity.ts'
import type { ContractResponse } from './contract-client.ts'
import type { TestApp } from './test-app.ts'
import type { Person } from './world.ts'

/** What a test says about a request; the person is who `X-Dev-User` names, or nobody. */
export interface Call {
  readonly as?: Person
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly url: string
  readonly body?: object
}

export type Api = (call: Call) => Promise<ContractResponse>

/** Sends requests to the app as the people the tests name, every answer held to the contract. */
export function apiOf(server: TestApp): Api {
  return ({ as, method, url, body }) =>
    server.request({
      method,
      url,
      ...(as === undefined ? {} : { headers: { [devUserHeader]: as.email } }),
      ...(body === undefined ? {} : { payload: body }),
    })
}

/** The answer of the contract for a document that is not there, for the tests that compare other answers to it. */
export const notFound = {
  type: '/problems/not-found',
  title: 'Not found.',
  status: 404,
  code: 'not-found',
}

/**
 * The body of an answer as the type of the contract. The client has already held the answer to the contract, so the
 * type is what the test just checked, not a guess.
 */
export const bodyAs = <T>(response: ContractResponse): T => response.body as T
