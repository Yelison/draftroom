import type { operations } from '@draftroom/contract'

/**
 * Probes of the process and its database. The orchestrator and monitoring call them; the client never does, so the data
 * source does not carry them.
 */
type ProbeOperationId = 'getLiveness' | 'getReadiness'

/** The `operationId` of every operation of the contract the client can call. */
export type OperationId = Exclude<keyof operations, ProbeOperationId>

// The shapes below read the generated `operations`, so a change to `openapi.yaml` that reaches `schema.ts` changes the
// interface and breaks, at compile time, every implementation that no longer fits.

type Part<Operation, Key extends 'path' | 'query'> = Operation extends { parameters: infer Parameters }
  ? Parameters extends { [Name in Key]?: infer Value }
    ? NonNullable<Value>
    : never
  : never

type Body<Operation> = Operation extends { requestBody?: infer Request }
  ? [NonNullable<Request>] extends [never]
    ? never
    : NonNullable<Request> extends { content: { 'application/json': infer Content } }
      ? Content
      : never
  : never

type PathPart<Operation> = [Part<Operation, 'path'>] extends [never]
  ? unknown
  : { params: { path: Part<Operation, 'path'>; query?: Part<Operation, 'query'> } }

type QueryPart<Operation> = [Part<Operation, 'path'>] extends [never]
  ? [Part<Operation, 'query'>] extends [never]
    ? unknown
    : { params?: { query?: Part<Operation, 'query'> } }
  : unknown

type BodyPart<Operation> = [Body<Operation>] extends [never]
  ? unknown
  : Operation extends { requestBody: unknown }
    ? { body: Body<Operation> }
    : { body?: Body<Operation> }

/**
 * What a call takes, in the shape `openapi-fetch` takes it: `params.path` and `params.query` for the parameters and
 * `body` for the JSON body. Each part exists only when the operation has it.
 */
export type RequestOf<Id extends OperationId> = PathPart<operations[Id]> &
  QueryPart<operations[Id]> &
  BodyPart<operations[Id]>

type SuccessContent<Responses> = Responses extends { 200: { content: { 'application/json': infer Json } } }
  ? Json
  : Responses extends { 201: { content: { 'application/json': infer Json } } }
    ? Json
    : void

/**
 * What a call resolves with. A failure is never a value: the promise rejects with an `ApiError` carrying the contract's
 * `code`, or with a `TransportError` when no answer of the contract arrived. The version download is the one body that
 * is not JSON: the generator types it as `string`, but it is a Yjs update, so it comes back as bytes.
 */
export type ResultOf<Id extends OperationId> = Id extends 'getVersionContent'
  ? Uint8Array
  : SuccessContent<operations[Id]['responses']>

type Method<Id extends OperationId> =
  unknown extends RequestOf<Id>
    ? () => Promise<ResultOf<Id>>
    : {} extends RequestOf<Id>
      ? (request?: RequestOf<Id>) => Promise<ResultOf<Id>>
      : (request: RequestOf<Id>) => Promise<ResultOf<Id>>

/** One method per operation of the contract, named by its `operationId`. */
export type RestSource = { readonly [Id in OperationId]: Method<Id> }

/** Where and how a document is opened for collaboration: what a session needs to connect, and nothing of the session. */
export interface CollaborationEndpoint {
  /** The collaboration server. */
  readonly url: string
  /** The WebSocket to use instead of the browser's: the mock hands out the one of its simulated server. */
  readonly webSocket?: new (url: string) => unknown
}

/**
 * The collaboration half of the data source. It is where to connect and not the connection: the session, with Yjs and the
 * provider behind it, is loaded with the editor (`useCollabSession`) and not with the app, so a screen that has no editor
 * does not download it.
 */
export interface CollaborationSource {
  readonly collaboration: CollaborationEndpoint
}

export type DataSource = RestSource & CollaborationSource
