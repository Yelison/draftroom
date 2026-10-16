import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach } from 'vitest'

/**
 * Gives every test of the file a browser that has stored nothing. `fake-indexeddb/auto` installs the globals once; a new
 * factory for each test is what keeps a copy that one test left from being the starting point of the next, which would
 * otherwise turn an unknown document into one the person already had.
 */
export function withFreshIndexedDb(): void {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })
}
