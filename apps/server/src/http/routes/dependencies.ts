import type { Kysely } from 'kysely'
import type { Database } from '../../db/tables.ts'
import type { Contract } from '../contract.ts'
import type { DocumentBroadcaster } from '../document-broadcaster.ts'

/** What every group of routes is registered with. */
export interface RouteDependencies {
  readonly contract: Contract
  readonly database: Kysely<Database>
  readonly broadcaster: DocumentBroadcaster
}
