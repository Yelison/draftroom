import type { Migration, MigrationProvider } from 'kysely/migration'
import * as initial from './0001_initial.ts'
import * as activityEvents from './0002_activity_events.ts'

/**
 * Every migration, by name, in the order they ran. Kysely sorts by name, hence the numeric prefix. A static list rather
 * than a scan of the folder: it works the same from sources, from a bundle and in a container, and a test checks that
 * no file is missing from it. A merged migration is never edited: a change is a new file and a new line here.
 */
export const migrations: Readonly<Record<string, Migration>> = {
  '0001_initial': initial,
  '0002_activity_events': activityEvents,
}

export const migrationProvider: MigrationProvider = {
  getMigrations: () => Promise.resolve(migrations),
}
